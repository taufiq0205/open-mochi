import assert from "node:assert/strict"
import { randomUUID } from "node:crypto"
import nextEnv from "@next/env"
import { sql } from "drizzle-orm"

nextEnv.loadEnvConfig(process.cwd())
const { db } = await import("../lib/database.ts")

try {
  const result = await db.execute(sql`select 1 as ok`)
  assert.equal(result.rows[0].ok, 1)
  const client = await db.$client.connect()
  const id = randomUUID()
  try {
    await client.query("BEGIN")
    await client.query(
      "INSERT INTO bots (id, user_id, name, avatar, job) VALUES ($1, $2, 'DB check', 'test', 'test')",
      [id, id]
    )
    await client.query("INSERT INTO chats (id, user_id) VALUES ($1, $2)", [
      id,
      id,
    ])
    await client.query(
      "INSERT INTO chat_members (chat_id, bot_id) VALUES ($1, $1)",
      [id]
    )
    await client.query("SAVEPOINT duplicate_member")
    await assert.rejects(
      client.query(
        "INSERT INTO chat_members (chat_id, bot_id) VALUES ($1, $1)",
        [id]
      ),
      { code: "23505" }
    )
    await client.query("ROLLBACK TO SAVEPOINT duplicate_member")
    await client.query("DELETE FROM chats WHERE id = $1", [id])
    const members = await client.query(
      "SELECT * FROM chat_members WHERE chat_id = $1",
      [id]
    )
    assert.equal(members.rowCount, 0)
    const bot = await client.query("SELECT user_id FROM bots WHERE id = $1", [
      id,
    ])
    assert.equal(bot.rows[0].user_id, id)
  } finally {
    await client.query("ROLLBACK")
    client.release()
  }
  console.log(
    "Database smoke check passed: PostgreSQL connection, schema writes, uniqueness and cascade checks passed (rolled back)."
  )
} finally {
  await db.$client.end()
}
