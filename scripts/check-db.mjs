import assert from "node:assert/strict"
import nextEnv from "@next/env"
import { sql } from "drizzle-orm"

nextEnv.loadEnvConfig(process.cwd())
const { db } = await import("../lib/db.ts")

try {
  const result = await db.execute(sql`select 1 as ok`)
  assert.equal(result.rows[0].ok, 1)
  console.log("Database smoke check passed: Drizzle connected to Neon.")
} finally {
  await db.$client.end()
}
