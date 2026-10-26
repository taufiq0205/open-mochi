"use server"

import { logger } from "@sentry/core"
import { and, eq, notExists, sql } from "drizzle-orm"
import { getAccess } from "@/lib/session"
import { BILLING_ERROR } from "@/lib/billing"
import { revalidatePath } from "next/cache"
import { DaytonaNotFoundError, type Sandbox } from "@daytona/sdk"

import { db } from "@/lib/db"
import {
  reserveSandboxCreation,
  closeSandboxLease,
} from "@/lib/metered-sandbox"
import {
  SANDBOX_TTL_MINUTES,
  STORAGE_TTL_MINUTES,
  sandboxCost,
  UsageError,
} from "@/lib/usage-policy"
import { getDaytona } from "@/lib/daytona"
import {
  bots,
  chatMembers,
  chats,
  createBotSchema,
  insertBotSchema,
} from "@/lib/db/schema"

export async function createBot(input: unknown) {
  const { userId, paid } = await getAccess()
  if (!paid) return { error: BILLING_ERROR }
  const parsed = createBotSchema.safeParse(input)
  if (!parsed.success) {
    return { error: "Check the bot details and try again." }
  }

  let stage = "create sandbox"
  let sandbox: Sandbox | undefined
  let lease: Awaited<ReturnType<typeof reserveSandboxCreation>> | undefined
  try {
    lease = await reserveSandboxCreation(userId)
    sandbox = await getDaytona().create(
      {
        name: lease.name,
        ttlMinutes: SANDBOX_TTL_MINUTES,
        autoStopInterval: 1,
        autoDeleteInterval: STORAGE_TTL_MINUTES,
        public: false,
      },
      { timeout: 60 }
    )
    sandboxCost(sandbox.cpu, sandbox.memory, sandbox.disk, sandbox.gpu)
    stage = "create MEMORY.md"
    await sandbox.fs.uploadFile(Buffer.alloc(0), "MEMORY.md", 60)
    stage = "stop sandbox"
    await sandbox.stop()
    await sandbox.setTtl(STORAGE_TTL_MINUTES)
    const sandboxId = sandbox.id
    stage = "save bot and chat"
    await db.transaction(async (tx) => {
      const [bot] = await tx
        .insert(bots)
        .values(insertBotSchema.parse({ ...parsed.data, userId, sandboxId }))
        .returning({ id: bots.id })
      const [chat] = await tx
        .insert(chats)
        .values({ userId, kind: "direct" })
        .returning({ id: chats.id })
      await tx.insert(chatMembers).values({ chatId: chat.id, botId: bot.id })
      await tx.execute(
        sql`UPDATE usage_ledger SET closed_at=now(), settled_at=now() WHERE id=${lease!.id}`
      )
    })
  } catch (error) {
    logger.error("Bot creation failed", {
      stage,
      error_type: error instanceof Error ? error.name : "Unknown",
    })
    if (sandbox) {
      try {
        await sandbox.delete()
      } catch {
        logger.error("Bot sandbox cleanup failed")
      }
    }
    if (lease) {
      try {
        await closeSandboxLease(lease.id)
      } catch {
        logger.warn("Sandbox lease cleanup will retry")
      }
    }
    return {
      error:
        error instanceof UsageError
          ? error.message
          : "Could not create your bot. Please try again.",
      usageLimit: error instanceof UsageError,
    }
  }

  revalidatePath("/(dashboard)", "layout")
  logger.info("Bot created")
  return { success: true }
}

export async function updateBot(botId: unknown, input: unknown) {
  const { userId, paid } = await getAccess()
  if (!paid) return { error: BILLING_ERROR }
  const id = insertBotSchema.shape.id.unwrap().safeParse(botId)
  const parsed = createBotSchema.safeParse(input)
  if (!id.success || !id.data || !parsed.success) {
    return { error: "Check the bot details and try again." }
  }

  try {
    const [bot] = await db
      .update(bots)
      .set(parsed.data)
      .where(and(eq(bots.id, id.data), eq(bots.userId, userId)))
      .returning({ id: bots.id })
    if (!bot) return { error: "Bot not found. Refresh the page and try again." }
  } catch {
    logger.error("Bot update failed")
    return { error: "Could not update your bot. Please try again." }
  }

  revalidatePath("/(dashboard)", "layout")
  logger.info("Bot updated")
  return { success: true }
}

export async function deleteBot(botId: unknown) {
  const { userId, paid } = await getAccess()
  if (!paid) return { error: BILLING_ERROR }
  const id = insertBotSchema.shape.id.unwrap().safeParse(botId)
  if (!id.success || !id.data)
    return { error: "Invalid bot. Refresh the page and try again." }

  try {
    const bot = await db.transaction(async (tx) => {
      const [deleted] = await tx
        .delete(bots)
        .where(and(eq(bots.id, id.data), eq(bots.userId, userId)))
        .returning({ id: bots.id, sandboxId: bots.sandboxId })
      if (deleted?.sandboxId) {
        try {
          const sandbox = await getDaytona().get(deleted.sandboxId)
          await sandbox.delete()
        } catch (error) {
          // A previous deletion may have succeeded before the DB commit failed.
          if (!(error instanceof DaytonaNotFoundError)) throw error
        }
      }
      if (deleted) {
        await tx
          .delete(chats)
          .where(
            and(
              eq(chats.userId, userId),
              eq(chats.kind, "direct"),
              notExists(
                tx
                  .select({ chatId: chatMembers.chatId })
                  .from(chatMembers)
                  .where(eq(chatMembers.chatId, chats.id))
              )
            )
          )
      }
      return deleted
    })
    if (!bot) return { error: "Bot not found. Refresh the page and try again." }
  } catch {
    logger.error("Bot deletion failed")
    return { error: "Could not delete your bot. Please try again." }
  }

  revalidatePath("/(dashboard)", "layout")
  logger.info("Bot deleted")
  return { success: true }
}
