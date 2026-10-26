import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

let session = null
let billingError = null
let billingCalls = 0
let checkedUser
const exports = {}
const dependencies = {
  "server-only": {},
  react: { cache: (fn) => fn },
  "next/headers": { headers: async () => new Headers() },
  "next/navigation": {
    redirect: (path) => {
      throw new Error(`redirect:${path}`)
    },
  },
  "./auth": { auth: { api: { getSession: async () => session } } },
  "./billing": { BILLING_ERROR: "unpaid" },
  "./paid-plan": {
    requirePaidUser: async (id) => {
      billingCalls++
      checkedUser = id
      if (billingError) throw billingError
    },
  },
}
new Function(
  "require",
  "exports",
  ts.transpileModule(
    readFileSync(new URL("../lib/session.ts", import.meta.url), "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } }
  ).outputText
)((name) => {
  assert.ok(name in dependencies, name)
  return dependencies[name]
}, exports)
await assert.rejects(exports.getAccess(), /redirect:\/sign-in/)
assert.equal(checkedUser, undefined)
session = { user: { id: "trusted-owner" } }
let identity = await exports.getAccess()
assert.equal(identity.userId, "trusted-owner")
assert.equal(checkedUser, "trusted-owner")
assert.equal(identity.paid, true)

billingError = new Error("unpaid")
identity = await exports.getAccess()
assert.equal(identity.paid, false)
billingError = new Error("provider unavailable")
const before = billingCalls
assert.deepEqual(await exports.requireSession(), { userId: "trusted-owner" })
assert.equal(billingCalls, before)
await assert.rejects(exports.getAccess(), /provider unavailable/)
console.log(
  "Session checks passed: anonymous redirect, trusted owner, paid/free gates, provider failure."
)
