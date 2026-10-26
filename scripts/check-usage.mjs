import * as sentryCore from "@sentry/core"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { randomUUID } from "node:crypto"
import ts from "typescript"
import * as ai from "ai"
import { MockLanguageModelV4 } from "ai/test"
import * as policy from "../lib/usage-policy.ts"

function load(file, dependencies) {
  const exports = {}
  const code = ts.transpileModule(
    readFileSync(new URL(file, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }
  ).outputText
  new Function("require", "exports", code)((name) => {
    if (name === "@sentry/core") return sentryCore
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, exports)
  return exports
}
assert.equal(policy.aiCost(1_000_000, 1_000_000), 1_500_000)
assert.ok(
  policy.AI_RESERVATION >= policy.aiCost(1_048_576, policy.MAX_OUTPUT_TOKENS)
)
assert.ok(policy.sandboxCost(4, 8, 10) < 60_000)
for (const invalid of [-1, NaN, Infinity, 0.5])
  assert.throws(() => policy.aiCost(invalid, 0))
assert.throws(() => policy.sandboxCost(5, 8, 10))
assert.throws(() => policy.sandboxCost(1, 1, 3, 1))

let denied = false
let databaseFailure = false
const reservations = []
const settlements = []
const period = {
  userId: "owner",
  start: new Date(),
  end: new Date(Date.now() + 60_000),
}
const { meteredModel } = load("../lib/metered-model.ts", {
  ai,
  "./usage-policy": policy,
  "./usage": {
    getUsagePeriod: async (id) => {
      assert.equal(id, "owner")
      return period
    },
    reserveUsage: async (...args) => {
      if (databaseFailure) throw new Error("Database unavailable")
      if (denied) throw new policy.UsageError(policy.USAGE_ERROR)
      reservations.push(args)
      return { id: "request" }
    },
    settleAI: async (...args) => settlements.push(args),
  },
})
let finish = true
const provider = new MockLanguageModelV4({
  doStream: async () => ({
    stream: new ReadableStream({
      start(controller) {
        if (finish)
          controller.enqueue({
            type: "finish",
            finishReason: { unified: "stop", raw: "stop" },
            usage: {
              inputTokens: { total: 1000 },
              outputTokens: { total: 100 },
            },
          })
        controller.close()
      },
    }),
    warnings: [],
  }),
})
const model = meteredModel(provider, "owner")
async function request() {
  const result = await model.doStream({ prompt: [], maxOutputTokens: 100_000 })
  for await (const _ of result.stream) void _
}
await request()
assert.equal(provider.doStreamCalls[0].maxOutputTokens, 4096)
assert.equal(reservations[0][2], policy.AI_RESERVATION)
assert.deepEqual(settlements[0], ["request", 1000, 100, 420])
finish = false
await request()
assert.equal(reservations.length, 2)
assert.equal(
  settlements.length,
  1,
  "Unconfirmed stream must retain its reservation"
)
denied = true
await assert.rejects(request(), /Usage limit/)
assert.equal(
  provider.doStreamCalls.length,
  2,
  "No provider request after quota denial"
)
denied = false
databaseFailure = true
await assert.rejects(request(), /Database unavailable/)
assert.equal(provider.doStreamCalls.length, 2)
databaseFailure = false

const events = []
let leaseClosed = false
let stopFailure = false
const lease = {
  id: "lease",
  user_id: "owner",
  sandbox_name: "sandbox",
  expires_at: new Date(Date.now() + 300_000),
  closed_at: null,
}
const client = {
  query: async (sql) => {
    if (sql.startsWith("SELECT"))
      return {
        rows: [{ ...lease, closed_at: leaseClosed ? new Date() : null }],
        rowCount: 1,
      }
    if (sql.includes("closed_at=now()")) leaseClosed = true
    return { rows: [], rowCount: 1 }
  },
}
const sandbox = {
  state: "stopped",
  cpu: 1,
  memory: 1,
  disk: 3,
  gpu: 0,
  setTtl: async (ttl) => events.push(["ttl", ttl]),
  start: async () => events.push(["start"]),
  delete: async () => events.push(["delete"]),
  stop: async () => {
    events.push(["stop"])
    if (stopFailure) throw new Error("stop failed")
  },
}
const { openMeteredSandbox, closeSandboxLease } = load(
  "../lib/metered-sandbox.ts",
  {
    "node:crypto": { randomUUID },
    "@daytona/sdk": { DaytonaNotFoundError: class extends Error {} },
    "@trigger.dev/sdk": {
      configure: () => {},
      tasks: { trigger: async () => events.push(["schedule"]) },
    },
    "./database": { db: { $client: client } },
    "./daytona": { getDaytona: () => ({ get: async () => sandbox }) },
    "./usage-policy": policy,
    "./usage": {
      getUsagePeriod: async () => period,
      withUsageLock: async (_, run) => run(client),
      reserveUsage: async () => ({
        id: "lease",
        expiresAt: lease.expires_at,
        existing: false,
      }),
    },
  }
)
await openMeteredSandbox("owner", "sandbox")
assert.deepEqual(events.slice(0, 3), [["ttl", 6], ["schedule"], ["start"]])
sandbox.state = "started"
await closeSandboxLease("lease")
assert.deepEqual(events.slice(-2), [["stop"], ["ttl", 1440]])
const eventCount = events.length
await closeSandboxLease("lease")
assert.equal(
  events.length,
  eventCount,
  "Duplicate stop cannot stop a newer session"
)
leaseClosed = false
stopFailure = true
await assert.rejects(closeSandboxLease("lease"), /stop failed/)
assert.deepEqual(
  events.at(-1),
  ["stop"],
  "Failed stop must never extend the short TTL"
)
stopFailure = false
lease.expires_at = new Date(Date.now() - 2 * 24 * 60 * 60_000)
await closeSandboxLease("lease")
assert.deepEqual(
  events.at(-1),
  ["delete"],
  "Delayed cleanup must not extend storage indefinitely"
)
console.log(
  "Usage checks passed: cost bounds, output cap, per-call admission, unconfirmed streams, TTL-before-start, stop-before-retention, and duplicate cleanup (stubbed providers)."
)

if (process.argv.includes("--live")) {
  const { default: nextEnv } = await import("@next/env")
  const { Pool } = await import("pg")
  nextEnv.loadEnvConfig(process.cwd())
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    connectionTimeoutMillis: 10_000,
  })
  const userId = `usage-check-${randomUUID()}`
  const p = {
    userId,
    start: new Date(Date.now() - 1000),
    end: new Date(Date.now() + 3_600_000),
  }
  const usage = load("../lib/usage.ts", {
    "node:crypto": { randomUUID },
    "./database": { db: { $client: pool } },
    "./usage-policy": policy,
    "./paid-plan": {
      requirePaidUser: async () => ({
        periodStart: p.start.getTime(),
        periodEnd: p.end.getTime(),
      }),
    },
  })
  try {
    assert.deepEqual(await usage.getUsagePeriod(userId), p)
    const competing = await Promise.allSettled(
      Array.from({ length: 10 }, () => usage.reserveUsage(p, "ai", 1_000_000))
    )
    const successful = competing.filter((r) => r.status === "fulfilled")
    assert.equal(
      successful.length,
      5,
      "Concurrent requests must not exceed the budget"
    )
    const id = successful[0].value.id
    await Promise.all([
      usage.settleAI(id, 1000, 100, 420),
      usage.settleAI(id, 1000, 100, 420),
    ])
    assert.equal(
      (await usage.getUsageSummary(p)).ai,
      4_000_420,
      "Settlement must be idempotent"
    )
    await assert.rejects(
      usage.reserveUsage({ ...p, end: new Date(Date.now() - 1) }, "ai", 1),
      /Usage limit/
    )
    const next = {
      ...p,
      start: new Date(p.end),
      end: new Date(p.end.getTime() + 3_600_000),
    }
    assert.equal(
      (await usage.getUsageSummary(next)).ai,
      0,
      "New periods must not inherit usage"
    )
    const leases = await Promise.allSettled(
      ["one", "two"].map((name) =>
        usage.reserveUsage(p, "sandbox", 100, { name, creating: false })
      )
    )
    assert.equal(
      leases.filter((r) => r.status === "fulfilled").length,
      1,
      "Only one active sandbox per user"
    )
    const active = (
      await pool.query(
        "SELECT id, sandbox_name FROM usage_ledger WHERE user_id=$1 AND meter='sandbox'",
        [userId]
      )
    ).rows[0]
    await pool.query("UPDATE usage_ledger SET ready_at=now() WHERE id=$1", [
      active.id,
    ])
    const reused = await usage.reserveUsage(p, "sandbox", 100, {
      name: active.sandbox_name,
      creating: false,
    })
    assert.equal(reused.existing, true)
    assert.equal(
      (await usage.getUsageSummary(p)).sandbox,
      100,
      "Reconnect must not double-charge"
    )
    await pool.query("UPDATE usage_ledger SET closed_at=now() WHERE id=$1", [
      active.id,
    ])
    for (let i = 0; i < 3; i++)
      await pool.query(
        "INSERT INTO bots (id,user_id,name,avatar,job) VALUES ($1,$2,'Test','test','Test')",
        [`${userId}-${i}`, userId]
      )
    await assert.rejects(
      usage.reserveUsage(p, "sandbox", 100, { name: "create", creating: true }),
      /3 stored bots/
    )
    console.log(
      "Live PostgreSQL checks passed: concurrent quota admission, idempotent settlement, period reset, expired-period denial, one sandbox, reconnect reuse, and bot cap."
    )
  } finally {
    await pool.query("DELETE FROM usage_ledger WHERE user_id=$1", [userId])
    await pool.query("DELETE FROM usage_periods WHERE user_id=$1", [userId])
    await pool.query("DELETE FROM bots WHERE user_id=$1", [userId])
    await pool.end()
  }
}
