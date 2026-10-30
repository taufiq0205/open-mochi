"use server"

import { logger } from "@sentry/core"
import { and, eq, notExists } from "drizzle-orm"
import { requireSession } from "@/lib/session"
import { revalidatePath } from "next/cache"
import type { Sandbox } from "@alibaba-group/opensandbox"

import { db } from "@/lib/db"
import {
  createSandbox,
  deleteSandbox,
  MEMORY_PATH,
  sandboxFiles,
} from "@/lib/opensandbox.mjs"
import {
  bots,
  chatMembers,
  chats,
  createBotSchema,
  insertBotSchema,
} from "@/lib/db/schema"

export async function createBot(input: unknown) {
  const { userId } = await requireSession()
  const parsed = createBotSchema.safeParse(input)
  if (!parsed.success) {
    return { error: "Check the bot details and try again." }
  }

  let stage = "create sandbox"
  let sandbox: Sandbox | undefined
  try {
    sandbox = await createSandbox()
    stage = "create MEMORY.md"
    await sandboxFiles(sandbox).writeFiles([
      { path: MEMORY_PATH, data: "", mode: 600 },
    ])
    stage = "pause sandbox"
    await sandbox.pause()
    const sandboxId = `osb:${sandbox.id}`
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
    })
  } catch (error) {
    logger.error("Bot creation failed", {
      stage,
      error_type: error instanceof Error ? error.name : "Unknown",
    })
    if (sandbox) {
      try {
        await sandbox.kill()
      } catch {
        logger.error("Bot sandbox cleanup failed")
      }
    }
    return {
      error: "Could not create your bot. Please try again.",
    }
  } finally {
    await sandbox?.close()
  }

  revalidatePath("/(dashboard)", "layout")
  logger.info("Bot created")
  return { success: true }
}

export async function updateBot(botId: unknown, input: unknown) {
  const { userId } = await requireSession()
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
  const { userId } = await requireSession()
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
        // Missing resources are safe to ignore after a previous deletion attempt.
        await deleteSandbox(deleted.sandboxId)
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
