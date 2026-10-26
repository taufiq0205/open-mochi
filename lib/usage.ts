import { logger } from "@sentry/core"
import { randomUUID } from "node:crypto"
import type { PoolClient } from "pg"
import { db } from "./database"
import { requirePaidUser } from "./paid-plan"
import {
  BOT_LIMIT,
  LEASE_MINUTES,
  USAGE_ERROR,
  USAGE_LIMIT,
  UsageError,
} from "./usage-policy"

export type UsagePeriod = { userId: string; start: Date; end: Date }
export type Lease = {
  id: string
  user_id: string
  sandbox_name: string
  expires_at: Date
  ready_at: Date | null
  closed_at: Date | null
}

export async function getUsagePeriod(userId: string): Promise<UsagePeriod> {
  const item = await requirePaidUser(userId)
  const start = new Date(item.periodStart)
  const end = new Date(item.periodEnd ?? NaN)
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    start > new Date() ||
    end <= new Date() ||
    start >= end
  )
    throw new Error("Could not verify your billing period. Please retry.")
  return { userId, start, end }
}

export async function withUsageLock<T>(
  userId: string,
  run: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await db.$client.connect()
  try {
    await client.query("BEGIN")
    await client.query(
      "SELECT pg_advisory_xact_lock(hashtextextended($1, 0))",
      [userId]
    )
    const result = await run(client)
    await client.query("COMMIT")
    return result
  } catch (error) {
    logger.warn("Usage transaction rolled back", {
      error_type: error instanceof Error ? error.name : "Unknown",
    })
    await client.query("ROLLBACK")
    throw error
  } finally {
    client.release()
  }
}

export async function reserveUsage(
  period: UsagePeriod,
  meter: "ai" | "sandbox",
  amount: number,
  sandbox?: { name: string; creating: boolean }
) {
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > USAGE_LIMIT)
    throw new UsageError(USAGE_ERROR)
  return withUsageLock(period.userId, async (client) => {
    if (period.end <= new Date()) throw new UsageError(USAGE_ERROR)
    if (sandbox) {
      const active = await client.query<Lease>(
        "SELECT * FROM usage_ledger WHERE user_id = $1 AND meter = 'sandbox' AND closed_at IS NULL",
        [period.userId]
      )
      if (active.rows.length) {
        const lease = active.rows[0]
        if (
          lease.sandbox_name === sandbox.name &&
          lease.ready_at &&
          lease.expires_at > new Date()
        )
          return { id: lease.id, expiresAt: lease.expires_at, existing: true }
        throw new UsageError(
          "A sandbox session is already active or stopping. Retry after it ends."
        )
      }
      if (sandbox.creating) {
        const bots = await client.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM bots WHERE user_id = $1",
          [period.userId]
        )
        if (bots.rows[0].count >= BOT_LIMIT)
          throw new UsageError(
            `Your plan allows ${BOT_LIMIT} stored bots. Delete a bot before creating another.`
          )
      }
    }
    await client.query(
      "INSERT INTO usage_periods (user_id, period_start, period_end) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING",
      [period.userId, period.start, period.end]
    )
    const column = meter === "ai" ? "ai_micros" : "sandbox_micros"
    const result = await client.query(
      `UPDATE usage_periods SET ${column} = ${column} + $3 WHERE user_id = $1 AND period_start = $2 AND ${column} + $3 <= $4 RETURNING user_id`,
      [period.userId, period.start, amount, USAGE_LIMIT]
    )
    if (!result.rowCount) throw new UsageError(USAGE_ERROR)
    const id = randomUUID()
    const expiresAt = new Date(
      Math.min(Date.now() + LEASE_MINUTES * 60_000, period.end.getTime())
    )
    await client.query(
      "INSERT INTO usage_ledger (id, user_id, period_start, meter, amount_micros, sandbox_name, expires_at, purpose) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)",
      [
        id,
        period.userId,
        period.start,
        meter,
        amount,
        sandbox?.name ?? null,
        sandbox ? expiresAt : null,
        sandbox ? (sandbox.creating ? "create" : "use") : null,
      ]
    )
    return { id, expiresAt, existing: false }
  })
}

export async function settleAI(
  id: string,
  input: number,
  output: number,
  amount: number
) {
  const { rows } = await db.$client.query<{ user_id: string }>(
    "SELECT user_id FROM usage_ledger WHERE id = $1 AND meter = 'ai'",
    [id]
  )
  if (!rows[0]) throw new Error("Usage reservation missing")
  await withUsageLock(rows[0].user_id, async (client) => {
    const { rows: entries } = await client.query(
      "SELECT * FROM usage_ledger WHERE id = $1 FOR UPDATE",
      [id]
    )
    const entry = entries[0]
    if (entry.settled_at) return
    if (
      !Number.isSafeInteger(amount) ||
      amount < 0 ||
      amount > entry.amount_micros
    )
      throw new Error("Provider usage exceeds reservation")
    await client.query(
      "UPDATE usage_periods SET ai_micros = ai_micros - $3 + $4 WHERE user_id = $1 AND period_start = $2",
      [entry.user_id, entry.period_start, entry.amount_micros, amount]
    )
    await client.query(
      "UPDATE usage_ledger SET amount_micros=$2, input_tokens=$3, output_tokens=$4, settled_at=now() WHERE id=$1",
      [id, amount, input, output]
    )
  })
}

export async function getUsageSummary(period: UsagePeriod) {
  const results = await Promise.all([
    db.$client.query(
      "SELECT ai_micros, sandbox_micros FROM usage_periods WHERE user_id=$1 AND period_start=$2",
      [period.userId, period.start]
    ),
    db.$client.query(
      "SELECT count(*)::int AS count FROM bots WHERE user_id=$1",
      [period.userId]
    ),
    db.$client.query(
      "SELECT coalesce(sum(amount_micros) FILTER (WHERE meter='ai' AND settled_at IS NULL),0)::int AS reserved, coalesce(sum(input_tokens),0)::bigint AS input, coalesce(sum(output_tokens),0)::bigint AS output FROM usage_ledger WHERE user_id=$1 AND period_start=$2",
      [period.userId, period.start]
    ),
  ])
  return {
    ai: results[0].rows[0]?.ai_micros ?? 0,
    sandbox: results[0].rows[0]?.sandbox_micros ?? 0,
    bots: results[1].rows[0].count,
    ...results[2].rows[0],
  }
}
