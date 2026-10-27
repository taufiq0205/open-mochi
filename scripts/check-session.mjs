import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

let session = null
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
await assert.rejects(exports.requireSession(), /redirect:\/sign-in/)
session = { user: { id: "trusted-owner" } }
assert.deepEqual(await exports.requireSession(), { userId: "trusted-owner" })
console.log("Session checks passed: anonymous redirect and trusted owner.")
