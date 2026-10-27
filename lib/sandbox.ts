import { db } from "./database"
import { getDaytona } from "./daytona"

export const STORAGE_TTL_MINUTES = 1440

export async function openSandbox(userId: string, sandboxId: string) {
  const owned = await db.$client.query(
    "SELECT id FROM bots WHERE user_id=$1 AND sandbox_id=$2",
    [userId, sandboxId]
  )
  if (!owned.rowCount) throw new Error("Sandbox not found.")
  const sandbox = await getDaytona().get(sandboxId)
  await sandbox.setTtl(STORAGE_TTL_MINUTES)
  if (["stopped", "archived", "paused"].includes(sandbox.state ?? ""))
    await sandbox.start()
  else if (sandbox.state !== "started") await sandbox.waitUntilStarted()
  return sandbox
}
