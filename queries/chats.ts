import "server-only"

import { requireSession } from "@/lib/session"
import { and, asc, desc, eq, sql } from "drizzle-orm"

import { db } from "@/lib/db"
import { bots, chatMembers, chats } from "@/lib/db/schema"

export type ChatBot = { id: string; name: string; avatar: string }

const members = (userId: string) => sql<ChatBot[]>`coalesce((
  select jsonb_agg(jsonb_build_object('id', b.id, 'name', b.name, 'avatar', b.avatar)
    order by m.joined_at, b.id)
  from chat_members m join bots b on b.id = m.bot_id
  where m.chat_id = ${chats.id} and b.user_id = ${userId}
), '[]'::jsonb)`

export async function getUserBots() {
  const { userId } = await requireSession()
  return db
    .select({ id: bots.id, name: bots.name, avatar: bots.avatar })
    .from(bots)
    .where(eq(bots.userId, userId))
    .orderBy(asc(bots.name), asc(bots.id))
}

export async function getUserChats() {
  const { userId } = await requireSession()
  const firstBot = db
    .select({ name: bots.name, avatar: bots.avatar })
    .from(chatMembers)
    .innerJoin(bots, eq(chatMembers.botId, bots.id))
    .where(and(eq(chatMembers.chatId, chats.id), eq(bots.userId, userId)))
    .orderBy(asc(chatMembers.joinedAt), asc(bots.id))
    .limit(1)
    .as("first_bot")

  return db
    .select({
      id: chats.id,
      kind: chats.kind,
      members: members(userId),
      name: chats.name,
      lastMessagePreview: chats.lastMessagePreview,
      lastMessageAt: chats.lastMessageAt,
      botName: firstBot.name,
      botAvatar: firstBot.avatar,
    })
    .from(chats)
    .leftJoinLateral(firstBot, eq(chats.userId, userId))
    .where(eq(chats.userId, userId))
    .orderBy(desc(chats.lastMessageAt), asc(chats.id))
}

export async function getChat(chatId: string) {
  const { userId } = await requireSession()
  const firstBot = db
    .select({
      id: bots.id,
      name: bots.name,
      avatar: bots.avatar,
      job: bots.job,
      instructions: bots.instructions,
      sandboxId: bots.sandboxId,
    })
    .from(chatMembers)
    .innerJoin(bots, eq(chatMembers.botId, bots.id))
    .where(and(eq(chatMembers.chatId, chats.id), eq(bots.userId, userId)))
    .orderBy(asc(chatMembers.joinedAt), asc(bots.id))
    .limit(1)
    .as("first_bot")

  const [chat] = await db
    .select({
      id: chats.id,
      kind: chats.kind,
      members: members(userId),
      name: chats.name,
      botId: firstBot.id,
      botJob: firstBot.job,
      botInstructions: firstBot.instructions,
      botSandboxId: firstBot.sandboxId,
      botName: firstBot.name,
      botAvatar: firstBot.avatar,
    })
    .from(chats)
    .leftJoinLateral(firstBot, eq(chats.userId, userId))
    .where(and(eq(chats.id, chatId), eq(chats.userId, userId)))
    .limit(1)

  return chat
}
