import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

function load(path, dependencies) {
  const exports = {}
  new Function(
    "require",
    "exports",
    ts.transpileModule(readFileSync(new URL(path, import.meta.url), "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    }).outputText
  )((name) => {
    assert.ok(name in dependencies, name)
    return dependencies[name]
  }, exports)
  return exports
}
let owned = true
let failure = false
let info = {
  status: { state: "Paused" },
  expiresAt: new Date(Date.now() + 86400000),
}
let rows = [{ user_id: "owner", sandbox_id: "osb:sandbox" }]
const calls = []
class SandboxApiException extends Error {
  constructor(statusCode) {
    super()
    this.statusCode = statusCode
  }
}
const handle = { close: async () => {}, files: {} }
const manager = {
  close: async () => {},
  getSandboxInfo: async (id) => {
    calls.push(["info", id])
    if (failure === "missing") throw new SandboxApiException(404)
    if (failure === "once") {
      failure = false
      throw new Error("Provider failed")
    }
    if (failure) throw new Error("Provider failed")
    return info
  },
  renewSandbox: async (...args) => calls.push(["renew", ...args]),
  pauseSandbox: async (id) => calls.push(["pause", id]),
  resumeSandbox: async (id) => calls.push(["resume", id]),
  killSandbox: async (id) => {
    calls.push(["kill", id])
    if (failure)
      throw new SandboxApiException(failure === "missing" ? 404 : 500)
  },
}
const sdk = {
  SandboxApiException,
  SandboxManager: { create: () => manager },
  Sandbox: {
    create: async (options) => {
      calls.push(["create", options])
      return handle
    },
    connect: async (options) => {
      calls.push(["connect", options.sandboxId])
      return handle
    },
  },
}
process.env.OPEN_SANDBOX_API_KEY = "test-only"
const provider = load("../lib/opensandbox.mjs", {
  "@alibaba-group/opensandbox": sdk,
  "node:crypto": { randomBytes: () => Buffer.alloc(8) },
})
await provider.createSandbox()
const [, options] = calls.pop()
assert.equal(options.timeoutSeconds, 86400)
assert.equal(options.connectionConfig.useServerProxy, true)
assert.equal(options.resource.memory, "2Gi")
assert.ok(
  options.networkPolicy.egress.some(
    (rule) => rule.target === "172.16.0.0/12" && rule.action === "deny"
  )
)
for (const id of ["legacy", "e2b:sandbox", "osb:"])
  assert.throws(() => provider.openSandboxId(id), /Legacy sandbox/)
await provider.deleteSandbox("osb:sandbox")
assert.deepEqual(calls.pop(), ["kill", "sandbox"])
failure = "missing"
await provider.deleteSandbox("osb:sandbox")
failure = true
await assert.rejects(provider.deleteSandbox("osb:sandbox"))
failure = false
calls.length = 0
let locked = false
const api = load("../lib/sandbox.ts", {
  "@alibaba-group/opensandbox": sdk,
  "./opensandbox.mjs": provider,
  "drizzle-orm": {
    sql: (strings, ...values) => ({ text: strings.join("?"), values }),
  },
  "./database": {
    db: {
      $client: { query: async () => ({ rows }) },
      transaction: async (fn) => {
        assert.equal(locked, false)
        locked = true
        try {
          return await fn({
            execute: async (query) => {
              assert.match(query.text, /FOR UPDATE/)
              assert.deepEqual(query.values, ["owner", "osb:sandbox"])
              return { rowCount: owned ? 1 : 0 }
            },
          })
        } finally {
          locked = false
        }
      },
    },
  },
})
const open = () => api.openSandbox("owner", "osb:sandbox")
owned = false
await assert.rejects(open(), /Sandbox not found/)
assert.deepEqual(calls, [])
owned = true
assert.equal(await open(), handle)
assert.deepEqual(calls.splice(0), [
  ["info", "sandbox"],
  ["renew", "sandbox", 86400],
  ["resume", "sandbox"],
  ["connect", "sandbox"],
])
info = {
  status: { state: "Running" },
  expiresAt: new Date(Date.now() + 86000000),
}
assert.deepEqual(await api.cleanupSandboxes(), { paused: 1 })
assert.deepEqual(calls.splice(0), [
  ["info", "sandbox"],
  ["pause", "sandbox"],
])
info.expiresAt = new Date(Date.now() + 86400000)
assert.deepEqual(await api.cleanupSandboxes(), { paused: 0 })
info.status.state = "Paused"
info.expiresAt = new Date(0)
await assert.rejects(open(), /expired/)
info.status.state = "Error"
info.expiresAt = new Date(Date.now() + 86400000)
await assert.rejects(open(), /unavailable/)
failure = "missing"
assert.deepEqual(await api.cleanupSandboxes(), { paused: 0 })
failure = true
await assert.rejects(api.cleanupSandboxes(), /cleanup incomplete/)
rows = [rows[0], rows[0]]
info = {
  status: { state: "Running" },
  expiresAt: new Date(Date.now() + 86000000),
}
failure = "once"
calls.length = 0
await assert.rejects(api.cleanupSandboxes(), /cleanup incomplete/)
assert.deepEqual(calls, [
  ["info", "sandbox"],
  ["info", "sandbox"],
  ["pause", "sandbox"],
])
console.log(
  "OpenSandbox lifecycle passed: legacy guards, ownership/row lock, TTL renewal, pause/resume, idle sweep, missing deletion and failure isolation (stubbed)."
)
