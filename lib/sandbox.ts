import { sql } from "drizzle-orm"
import { Sandbox } from "@alibaba-group/opensandbox"
import { db } from "./database"
import {
  openSandboxId,
  sandboxConfig,
  getSandboxManager,
  isSandboxMissing,
  STORAGE_TTL_SECONDS,
  IDLE_TIMEOUT_MS,
} from "./opensandbox.mjs"

async function withSandbox<T>(
  userId: string,
  sandboxId: string,
  operation: (id: string) => Promise<T>
) {
  return db.transaction(async (tx) => {
    const owned = await tx.execute(
      sql`SELECT id FROM bots WHERE user_id=${userId} AND sandbox_id=${sandboxId} FOR UPDATE`
    )
    if (!owned.rowCount) throw new Error("Sandbox not found.")
    return operation(openSandboxId(sandboxId))
  })
}

export async function openSandbox(userId: string, sandboxId: string) {
  return withSandbox(userId, sandboxId, async (id) => {
    const manager = getSandboxManager()
    try {
      const info = await manager.getSandboxInfo(id)
      if (!info.expiresAt || info.expiresAt.getTime() <= Date.now())
        throw new Error("Sandbox expired.")
      await manager.renewSandbox(id, STORAGE_TTL_SECONDS)
      if (info.status.state === "Paused") await manager.resumeSandbox(id)
      else if (info.status.state !== "Running")
        throw new Error("Sandbox unavailable.")
      return await Sandbox.connect({
        sandboxId: id,
        connectionConfig: sandboxConfig(),
      })
    } finally {
      await manager.close()
    }
  })
}

export async function cleanupSandboxes() {
  const { rows } = await db.$client.query<{
    user_id: string
    sandbox_id: string
  }>("SELECT user_id, sandbox_id FROM bots WHERE sandbox_id LIKE 'osb:%'")
  const manager = getSandboxManager()
  let paused = 0
  let failed = 0
  try {
    for (const row of rows) {
      try {
        await withSandbox(row.user_id, row.sandbox_id, async (id) => {
          const info = await manager.getSandboxInfo(id)
          if (
            info.status.state === "Running" &&
            info.expiresAt &&
            info.expiresAt.getTime() -
              STORAGE_TTL_SECONDS * 1000 +
              IDLE_TIMEOUT_MS <=
              Date.now()
          ) {
            await manager.pauseSandbox(id)
            paused++
          }
        })
      } catch (error) {
        if (!isSandboxMissing(error)) failed++
      }
    }
  } finally {
    await manager.close()
  }
  if (failed) throw new Error("Sandbox cleanup incomplete; retry required.")
  return { paused }
}
