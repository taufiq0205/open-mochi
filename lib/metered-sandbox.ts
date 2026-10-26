import { logger } from "@sentry/core"
import { randomUUID } from "node:crypto"
import { DaytonaNotFoundError, type Sandbox } from "@daytona/sdk"
import { configure, tasks } from "@trigger.dev/sdk"
import type { stopSandboxLease } from "../trigger/usage"
import { db } from "./database"
import { getDaytona } from "./daytona"
import {
  getUsagePeriod,
  reserveUsage,
  withUsageLock,
  type Lease,
} from "./usage"
import {
  SANDBOX_TTL_MINUTES,
  STORAGE_TTL_MINUTES,
  sandboxCost,
} from "./usage-policy"

// Match the chat transport: Vercel Git branches are not Trigger preview environments.
configure({ previewBranch: process.env.TRIGGER_PREVIEW_BRANCH ?? "" })

export async function reserveSandboxCreation(userId: string) {
  const period = await getUsagePeriod(userId)
  const name = `bot-${randomUUID()}`
  const lease = await reserveUsage(period, "sandbox", sandboxCost(4, 8, 10), {
    name,
    creating: true,
  })
  await scheduleStop(lease.id, lease.expiresAt)
  logger.info("Sandbox creation reserved", { lease_id: lease.id })
  return { ...lease, name }
}

async function scheduleStop(id: string, expiresAt: Date) {
  await tasks.trigger<typeof stopSandboxLease>(
    "stop-sandbox-lease",
    { id },
    { delay: expiresAt }
  )
}

export async function closeSandboxLease(id: string) {
  const { rows } = await db.$client.query<Lease>(
    "SELECT * FROM usage_ledger WHERE id=$1 AND meter='sandbox'",
    [id]
  )
  if (!rows[0]) return
  await withUsageLock(rows[0].user_id, async (client) => {
    const { rows: entries } = await client.query<Lease>(
      "SELECT * FROM usage_ledger WHERE id=$1 FOR UPDATE",
      [id]
    )
    const entry = entries[0]
    if (!entry || entry.closed_at) return
    try {
      const sandbox = await getDaytona().get(entry.sandbox_name)
      if (!["stopped", "archived"].includes(sandbox.state ?? ""))
        await sandbox.stop(60, true)
      // Only extend file retention after compute has stopped. A failed worker leaves the short TTL intact.
      const retentionMinutes = Math.min(
        STORAGE_TTL_MINUTES,
        Math.ceil(
          (entry.expires_at.getTime() +
            STORAGE_TTL_MINUTES * 60_000 -
            Date.now()) /
            60_000
        )
      )
      if (retentionMinutes > 0) await sandbox.setTtl(retentionMinutes)
      else await sandbox.delete()
    } catch (error) {
      if (!(error instanceof DaytonaNotFoundError)) throw error
    }
    await client.query(
      "UPDATE usage_ledger SET closed_at=now(), settled_at=now() WHERE id=$1",
      [id]
    )
    logger.info("Sandbox lease closed", { lease_id: id })
  })
}

export async function openMeteredSandbox(
  userId: string,
  sandboxId: string
): Promise<Sandbox> {
  const period = await getUsagePeriod(userId)
  const owned = await db.$client.query(
    "SELECT id FROM bots WHERE user_id=$1 AND sandbox_id=$2",
    [userId, sandboxId]
  )
  if (!owned.rowCount) throw new Error("Sandbox not found.")
  const sandbox = await getDaytona().get(sandboxId)
  const amount = sandboxCost(
    sandbox.cpu,
    sandbox.memory,
    sandbox.disk,
    sandbox.gpu
  )
  const lease = await reserveUsage(period, "sandbox", amount, {
    name: sandboxId,
    creating: false,
  })
  if (lease.existing) {
    if (sandbox.state !== "started")
      throw new Error("Sandbox session is ending. Please retry.")
    return sandbox
  }
  try {
    await sandbox.setTtl(
      Math.max(
        1,
        Math.min(
          SANDBOX_TTL_MINUTES,
          Math.ceil((lease.expiresAt.getTime() - Date.now()) / 60_000) + 1
        )
      )
    )
    await scheduleStop(lease.id, lease.expiresAt)
    if (["stopped", "archived", "paused"].includes(sandbox.state ?? ""))
      await sandbox.start()
    else if (sandbox.state !== "started") await sandbox.waitUntilStarted()
    if (lease.expiresAt <= new Date())
      throw new Error("Sandbox startup took too long. Please retry.")
    await db.$client.query(
      "UPDATE usage_ledger SET ready_at=now() WHERE id=$1 AND closed_at IS NULL",
      [lease.id]
    )
    logger.info("Sandbox ready", { lease_id: lease.id })
    return sandbox
  } catch (error) {
    logger.error("Sandbox startup failed", { lease_id: lease.id })
    await closeSandboxLease(lease.id)
    throw error
  }
}
