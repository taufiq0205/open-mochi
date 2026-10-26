import assert from "node:assert/strict"
import { GET } from "../app/healthz/route.ts"

const response = GET()
assert.equal(response.status, 200)
assert.equal(response.headers.get("content-type"), "application/json")
assert.deepEqual(await response.json(), { status: "ok" })
console.log("Health handler passed without provider credentials. Run Compose for middleware/container validation.")
