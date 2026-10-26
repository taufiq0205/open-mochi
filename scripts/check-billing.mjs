import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import * as billing from "../lib/billing.ts"

let linked = true
let exists = true
let items = []
let failure = false
const users = []
const compiled = ts.transpileModule(
  readFileSync(new URL("../lib/paid-plan.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS } }
).outputText
const exports = {}
new Function("require", "exports", compiled)((name) => {
  if (name === "./billing") return billing
  if (name === "drizzle-orm") return { eq: () => {} }
  if (name === "./db/schema") return { user: {} }
  if (name === "./database")
    return {
      db: {
        select: () => ({
          from: () => ({
            where: () => ({
              limit: async () =>
                exists ? [{ clerkUserId: linked ? "legacy_owner" : null }] : [],
            }),
          }),
        }),
      },
    }
  assert.equal(name, "@clerk/backend")
  return {
    createClerkClient: () => ({
      billing: {
        getUserBillingSubscription: async (userId) => {
          users.push(userId)
          if (failure) throw new Error("Clerk unavailable")
          return { subscriptionItems: items }
        },
      },
    }),
  }
}, exports)

const denied = () =>
  assert.rejects(exports.requirePaidUser("owner"), {
    message: billing.BILLING_ERROR,
  })
await denied()
for (const status of [
  "abandoned",
  "ended",
  "expired",
  "incomplete",
  "past_due",
  "upcoming",
]) {
  items = [{ plan: { slug: "pro" }, status }]
  await denied()
}
for (const plan of [null, { slug: "free_user" }, { slug: "other" }]) {
  items = [{ plan, status: "active" }]
  await denied()
}
items = [{ plan: { slug: "pro" }, status: "active" }]
await exports.requirePaidUser("owner")
items = [
  { plan: { slug: "pro" }, status: "canceled", periodEnd: Date.now() + 60_000 },
]
await exports.requirePaidUser("owner")
for (const periodEnd of [null, Date.now() - 1]) {
  items[0].periodEnd = periodEnd
  await denied()
}
failure = true
await assert.rejects(exports.requirePaidUser("owner"), /Clerk unavailable/)
assert.ok(users.every((userId) => userId === "legacy_owner"))
failure = false
const calls = users.length
linked = false
await denied()
exists = false
await denied()
assert.equal(
  users.length,
  calls,
  "Unlinked and missing users must never call Clerk"
)
console.log(
  "Billing checks passed: free, paid, canceled paid period, expired, unpaid, and Clerk failure (stubbed)."
)
