import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

let owned = true
let state = "stopped"
let fail = false
const calls = []
const sandbox = {
  get state() {
    return state
  },
  setTtl: async (ttl) => {
    calls.push(["ttl", ttl])
    if (fail) throw new Error("provider failure")
  },
  start: async () => calls.push("start"),
  waitUntilStarted: async () => calls.push("wait"),
}
const dependencies = {
  "./database": {
    db: {
      $client: {
        query: async (sql, params) => {
          assert.match(sql, /user_id=\$1 AND sandbox_id=\$2/)
          assert.deepEqual(params, ["owner", "sandbox"])
          return { rowCount: owned ? 1 : 0 }
        },
      },
    },
  },
  "./daytona": {
    getDaytona: () => ({
      get: async () => {
        calls.push("get")
        return sandbox
      },
    }),
  },
}
const exports = {}
new Function(
  "require",
  "exports",
  ts.transpileModule(
    readFileSync(new URL("../lib/sandbox.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }
  ).outputText
)((name) => {
  assert.ok(name in dependencies, name)
  return dependencies[name]
}, exports)
const open = () => exports.openSandbox("owner", "sandbox")
owned = false
await assert.rejects(open(), /Sandbox not found/)
assert.deepEqual(calls, [])
owned = true
for (state of ["stopped", "archived", "paused", "starting", "started"]) {
  calls.length = 0
  assert.equal(await open(), sandbox)
  assert.deepEqual(calls, [
    "get",
    ["ttl", 1440],
    ...(["stopped", "archived", "paused"].includes(state)
      ? ["start"]
      : state === "started"
        ? []
        : ["wait"]),
  ])
}
fail = true
await assert.rejects(open(), /provider failure/)
console.log(
  "Sandbox checks passed: ownership before provider access, retention, startup states, and provider failure."
)
