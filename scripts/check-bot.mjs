import * as sentryCore from "@sentry/core"
import assert from "node:assert/strict"
import * as billing from "../lib/billing.ts"
import * as usagePolicy from "../lib/usage-policy.ts"
import { readFileSync } from "node:fs"
import ts from "typescript"
import * as orm from "drizzle-orm"
import { drizzle } from "drizzle-orm/node-postgres"
import * as schema from "../lib/db/schema.ts"

const valid = {
  name: " Ada ",
  job: " Research assistant ",
  avatar: "seed",
  instructions: "",
}
assert.equal(schema.createBotSchema.parse(valid).name, "Ada")
for (const input of [
  null,
  {},
  { ...valid, name: " " },
  { ...valid, job: " " },
  { ...valid, avatar: "" },
  { ...valid, name: "a".repeat(101) },
  { ...valid, instructions: "a".repeat(10001) },
]) {
  assert.equal(schema.createBotSchema.safeParse(input).success, false)
}
assert.equal(
  schema.insertBotSchema.safeParse({ ...valid, userId: "user_1" }).success,
  true
)
assert.equal(schema.insertBotSchema.safeParse(valid).success, false)

// Run the real action with Clerk and database boundaries stubbed.
let sandboxFailure
let commitFailure = false
const sandboxCalls = []
class DaytonaNotFoundError extends Error {}
const sandbox = {
  id: "sandbox_1",
  cpu: 1,
  memory: 1,
  disk: 3,
  gpu: 0,
  setTtl: async () => {},
  fs: {
    uploadFile: async (content, path) => {
      assert.equal(content.length, 0)
      assert.equal(path, "MEMORY.md")
      sandboxCalls.push("memory")
      if (sandboxFailure === "memory") throw new Error("Upload failed")
    },
  },
  stop: async () => {
    sandboxCalls.push("stop")
    if (sandboxFailure === "stop") throw new Error("Stop failed")
  },
  delete: async () => {
    sandboxCalls.push("delete")
    if (sandboxFailure === "delete") throw new Error("Delete failed")
  },
}
let paid = true
let authenticated = true
let failingTable
const rows = []
const paths = []
let updateRows = [["bot_1"]]
let updateFailure = false
let cleanupFailure = false
const updates = []
const updateDb = drizzle({
  client: {
    query: async (query, values) => {
      updates.push({ text: query.text, values })
      if (
        updateFailure ||
        (cleanupFailure && query.text.startsWith('delete from "chats"'))
      )
        throw new Error("Database unavailable")
      return { rows: updateRows }
    },
  },
})
const telemetry = []
const dependencies = {
  "@/lib/usage-policy": usagePolicy,
  "@/lib/metered-sandbox": {
    reserveSandboxCreation: async () => ({
      id: "lease_1",
      name: "sandbox_name",
    }),
    closeSandboxLease: async () => {},
  },
  "@/lib/daytona": {
    getDaytona: () => new dependencies["@daytona/sdk"].Daytona(),
  },
  "@daytona/sdk": {
    DaytonaNotFoundError,
    Daytona: class {
      async create(params) {
        assert.deepEqual(params, {
          name: "sandbox_name",
          ttlMinutes: 6,
          autoStopInterval: 1,
          autoDeleteInterval: 1440,
          public: false,
        })
        sandboxCalls.push("create")
        if (sandboxFailure === "create") throw new Error("Create failed")
        return sandbox
      }
      async get(id) {
        assert.equal(id, "sandbox_1")
        sandboxCalls.push("get")
        if (sandboxFailure === "missing") throw new DaytonaNotFoundError()
        return sandbox
      }
    },
  },
  "drizzle-orm": orm,
  "@/lib/billing": billing,
  "@clerk/nextjs/server": {
    auth: {
      protect: async () => {
        if (!authenticated) throw new Error("Unauthorized")
        return { userId: "user_1", has: () => paid }
      },
    },
  },
  "next/cache": { revalidatePath: (...args) => paths.push(args) },
  "@/lib/db/schema": schema,
  "@/lib/db": {
    db: {
      update: (...args) => updateDb.update(...args),
      delete: (...args) => updateDb.delete(...args),
      transaction: async (callback) => {
        const pending = []
        const result = await callback({
          execute: async () => {},
          select: (...args) => updateDb.select(...args),
          delete: (...args) => updateDb.delete(...args),
          insert: (table) => ({
            values: (row) => {
              const result = Promise.resolve().then(() => {
                if (table === failingTable)
                  throw new Error("Database unavailable")
                pending.push({ table, row })
                return [{ id: table === schema.bots ? "bot_1" : "chat_1" }]
              })
              result.returning = () => result
              return result
            },
          }),
        })
        if (commitFailure) throw new Error("Commit failed")
        rows.push(...pending)
        return result
      },
    },
  },
}
const compiled = ts.transpileModule(
  readFileSync(new URL("../actions/bot.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }
).outputText
const actions = {}
new Function("require", "exports", compiled)((name) => {
  if (name === "@sentry/core")
    return {
      logger: {
        ...sentryCore.logger,
        error: (...args) => telemetry.push(args),
      },
    }
  assert.ok(name in dependencies, `Unexpected dependency: ${name}`)
  return dependencies[name]
}, actions)

paid = false
for (const invoke of [
  () => actions.createBot(valid),
  () => actions.updateBot("bot_1", valid),
  () => actions.deleteBot("bot_1"),
])
  assert.deepEqual(await invoke(), { error: billing.BILLING_ERROR })
assert.deepEqual(sandboxCalls, [])
assert.deepEqual(rows, [])
assert.deepEqual(updates, [])
paid = true

authenticated = false
await assert.rejects(actions.createBot(valid), /Unauthorized/)
assert.equal(rows.length, 0)
authenticated = true
assert.ok((await actions.createBot({ ...valid, name: " " })).error)
assert.equal(rows.length, 0)
assert.deepEqual(sandboxCalls, [])
assert.deepEqual(
  await actions.createBot({
    ...valid,
    userId: "attacker",
    id: "injected",
    sandboxId: "injected",
    chatId: "injected",
    botId: "injected",
    kind: "group",
  }),
  { success: true }
)
assert.deepEqual(rows, [
  {
    table: schema.bots,
    row: {
      name: "Ada",
      job: "Research assistant",
      avatar: "seed",
      instructions: "",
      userId: "user_1",
      sandboxId: "sandbox_1",
    },
  },
  { table: schema.chats, row: { userId: "user_1", kind: "direct" } },
  { table: schema.chatMembers, row: { chatId: "chat_1", botId: "bot_1" } },
])
assert.deepEqual(paths, [["/(dashboard)", "layout"]])
assert.deepEqual(sandboxCalls, ["create", "memory", "stop"])
for (const table of [schema.bots, schema.chats, schema.chatMembers]) {
  failingTable = table
  const before = sandboxCalls.length
  assert.ok((await actions.createBot(valid)).error)
  assert.deepEqual(sandboxCalls.slice(before), [
    "create",
    "memory",
    "stop",
    "delete",
  ])
  assert.equal(rows.length, 3)
  assert.deepEqual(paths, [["/(dashboard)", "layout"]])
}
failingTable = undefined
for (const failure of ["create", "memory", "stop"]) {
  sandboxFailure = failure
  const before = sandboxCalls.length
  assert.ok((await actions.createBot(valid)).error)
  assert.deepEqual(
    sandboxCalls.slice(before),
    failure === "create"
      ? ["create"]
      : failure === "memory"
        ? ["create", "memory", "delete"]
        : ["create", "memory", "stop", "delete"]
  )
  assert.equal(rows.length, 3)
}
sandboxFailure = "memory"
assert.ok((await actions.createBot(valid)).error)
assert.deepEqual(telemetry.at(-1), [
  "Bot creation failed",
  { stage: "create MEMORY.md", error_type: "Error" },
])
process.env.BOT_CHECK_SECRET = "Upload failed"
try {
  assert.ok((await actions.createBot(valid)).error)
  assert.ok(!JSON.stringify(telemetry).includes(process.env.BOT_CHECK_SECRET))
} finally {
  delete process.env.BOT_CHECK_SECRET
}
sandboxFailure = undefined
commitFailure = true
assert.ok((await actions.createBot(valid)).error)
assert.equal(rows.length, 3)
assert.equal(sandboxCalls.at(-1), "delete")
commitFailure = false
console.log(
  "Bot checks passed: validation, ownership, auth, sandbox creation/stop, cleanup, linked inserts, and transaction failures (stubbed)."
)

authenticated = false
await assert.rejects(actions.updateBot("bot_1", valid), /Unauthorized/)
assert.equal(updates.length, 0)
authenticated = true
for (const [id, input] of [
  [null, valid],
  ["", valid],
  ["bot_1", { ...valid, name: " " }],
]) {
  assert.ok((await actions.updateBot(id, input)).error)
}
assert.equal(updates.length, 0)
assert.deepEqual(
  await actions.updateBot("bot_1", {
    ...valid,
    userId: "attacker",
    id: "injected",
    sandboxId: "injected",
  }),
  { success: true }
)
assert.match(
  updates[0].text,
  /where \(.*"bots"\."id" = \$5 and "bots"\."user_id" = \$6\)/
)
assert.deepEqual(updates[0].values, [
  "Ada",
  "seed",
  "Research assistant",
  "",
  "bot_1",
  "user_1",
])
assert.deepEqual(paths.at(-1), ["/(dashboard)", "layout"])
const pathCount = paths.length
updateRows = []
assert.ok((await actions.updateBot("other_users_bot", valid)).error)
updateFailure = true
assert.ok((await actions.updateBot("bot_1", valid)).error)
assert.equal(paths.length, pathCount)
console.log(
  "Update checks passed: validation, authentication, ownership-scoped SQL, spoofed fields, missing bot, and database failure (stubbed)."
)

authenticated = false
await assert.rejects(actions.deleteBot("bot_1"), /Unauthorized/)
authenticated = true
const beforeDelete = updates.length
for (const id of [null, "", {}, 123])
  assert.ok((await actions.deleteBot(id)).error)
assert.equal(updates.length, beforeDelete)
updateFailure = false
updateRows = [["bot_1", "sandbox_1"]]
const sandboxBeforeDelete = sandboxCalls.length
assert.deepEqual(await actions.deleteBot("bot_1"), { success: true })
const botDeletion = updates.findLast((query) =>
  query.text.startsWith('delete from "bots"')
)
assert.match(
  botDeletion.text,
  /delete from "bots" where \("bots"\."id" = \$1 and "bots"\."user_id" = \$2\)/
)
assert.deepEqual(botDeletion.values, ["bot_1", "user_1"])
assert.deepEqual(sandboxCalls.slice(sandboxBeforeDelete), ["get", "delete"])
const chatCleanup = updates.findLast((query) =>
  query.text.startsWith('delete from "chats"')
)
assert.ok(chatCleanup, "Deleting a bot must remove its orphaned direct chat")
assert.match(chatCleanup.text, /"chats"\."user_id" = \$1/)
assert.match(chatCleanup.text, /"chats"\."kind" = \$2/)
assert.match(chatCleanup.text, /not exists .*"chat_members"/)
assert.deepEqual(chatCleanup.values, ["user_1", "direct"])

const deletePathCount = paths.length
cleanupFailure = true
assert.ok((await actions.deleteBot("bot_1")).error)
assert.equal(paths.length, deletePathCount)
cleanupFailure = false

const beforeMissing = sandboxCalls.length
updateRows = []
assert.ok((await actions.deleteBot("other_users_bot")).error)
updateFailure = true
assert.ok((await actions.deleteBot("bot_1")).error)
assert.equal(paths.length, deletePathCount)
assert.equal(sandboxCalls.length, beforeMissing)
updateFailure = false
updateRows = [["bot_1", "sandbox_1"]]
sandboxFailure = "delete"
assert.ok((await actions.deleteBot("bot_1")).error)
assert.equal(paths.length, deletePathCount)
sandboxFailure = "missing"
assert.deepEqual(await actions.deleteBot("bot_1"), { success: true })
sandboxFailure = undefined
commitFailure = true
assert.ok((await actions.deleteBot("bot_1")).error)
commitFailure = false
assert.deepEqual(await actions.deleteBot("bot_1"), { success: true })
updateRows = [["bot_1", null]]
const beforeLegacy = sandboxCalls.length
assert.deepEqual(await actions.deleteBot("bot_1"), { success: true })
assert.equal(sandboxCalls.length, beforeLegacy)
console.log(
  "Delete checks passed: auth, ownership, sandbox deletion/failure, absent sandbox, commit retry, orphan direct-chat cleanup, and legacy bot (stubbed)."
)
