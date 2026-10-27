"use server"

import { logger } from "@sentry/core"
import { requireSession } from "@/lib/session"
import { and, eq, inArray, notInArray } from "drizzle-orm"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { db } from "@/lib/db"
import {
  bots,
  chats,
  chatMembers,
  createGroupChatSchema,
} from "@/lib/db/schema"

export async function createGroupChat(input: unknown) {
  const { userId } = await requireSession()
  const parsed = createGroupChatSchema.safeParse(input)
  if (!parsed.success)
    return { error: "Enter a name and pick at least two bots." }
  try {
    const chatId = await db.transaction(async (tx) => {
      const owned = await tx
        .select({ id: bots.id })
        .from(bots)
        .where(
          and(eq(bots.userId, userId), inArray(bots.id, parsed.data.botIds))
        )
        .for("share")
      if (owned.length !== parsed.data.botIds.length)
        throw new Error("Invalid bots")
      const [group] = await tx
        .insert(chats)
        .values({ userId, kind: "group", name: parsed.data.name })
        .returning({ id: chats.id })
      await tx
        .insert(chatMembers)
        .values(owned.map((bot) => ({ chatId: group.id, botId: bot.id })))
      return group.id
    })
    revalidatePath("/(dashboard)", "layout")
    logger.info("Group chat created", {
      member_count: parsed.data.botIds.length,
    })
    return { chatId }
  } catch {
    logger.error("Group chat creation failed")
    return {
      error: "Could not create the group. Refresh your bot list and try again.",
    }
  }
}

const groupIdSchema = z.string().trim().min(1).max(100)

export async function updateGroupChat(chatId: unknown, input: unknown) {
  const { userId } = await requireSession()
  const id = groupIdSchema.safeParse(chatId)
  const parsed = createGroupChatSchema.safeParse(input)
  if (!id.success || !parsed.success)
    return { error: "Enter a name and pick at least two bots." }
  try {
    await db.transaction(async (tx) => {
      const [group] = await tx
        .update(chats)
        .set({ name: parsed.data.name })
        .where(
          and(
            eq(chats.id, id.data),
            eq(chats.userId, userId),
            eq(chats.kind, "group")
          )
        )
        .returning({ id: chats.id })
      if (!group) throw new Error("Group not found")
      const owned = await tx
        .select({ id: bots.id })
        .from(bots)
        .where(
          and(eq(bots.userId, userId), inArray(bots.id, parsed.data.botIds))
        )
        .for("share")
      if (owned.length !== parsed.data.botIds.length)
        throw new Error("Invalid bots")
      await tx
        .delete(chatMembers)
        .where(
          and(
            eq(chatMembers.chatId, group.id),
            notInArray(chatMembers.botId, parsed.data.botIds)
          )
        )
      await tx
        .insert(chatMembers)
        .values(owned.map((bot) => ({ chatId: group.id, botId: bot.id })))
        .onConflictDoNothing()
    })
  } catch {
    logger.error("Group chat update failed")
    return {
      error: "Could not update the group. Refresh the page and try again.",
    }
  }
  revalidatePath("/(dashboard)", "layout")
  logger.info("Group chat updated")
  return { success: true }
}

export async function deleteGroupChat(chatId: unknown) {
  const { userId } = await requireSession()
  const id = groupIdSchema.safeParse(chatId)
  if (!id.success)
    return { error: "Invalid group. Refresh the page and try again." }
  try {
    const [group] = await db
      .delete(chats)
      .where(
        and(
          eq(chats.id, id.data),
          eq(chats.userId, userId),
          eq(chats.kind, "group")
        )
      )
      .returning({ id: chats.id })
    if (!group)
      return { error: "Group not found. Refresh the page and try again." }
  } catch {
    logger.error("Group chat deletion failed")
    return { error: "Could not delete the group. Please try again." }
  }
  revalidatePath("/(dashboard)", "layout")
  logger.info("Group chat deleted")
  return { success: true }
}
