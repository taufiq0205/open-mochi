"use server"

import { logger } from "@sentry/core"
import { requireSession } from "@/lib/session"
import { auth as triggerAuth, configure } from "@trigger.dev/sdk"
import { chat, defaultStorage } from "@trigger.dev/sdk/ai"
import { z } from "zod"

import { getChat } from "@/queries/chats"

// Vercel's Git branch does not imply a Trigger.dev preview environment.
configure({
  baseURL: process.env.TRIGGER_API_URL ?? "http://localhost:8030",
  previewBranch: process.env.TRIGGER_PREVIEW_BRANCH ?? "",
})

const startSession = chat.createStartSessionAction("chat-agent")
const loadTranscript = chat.createLoadTranscriptAction(defaultStorage)

async function authorizeChat(chatId: string) {
  await requireSession()
  z.string().min(1).max(100).parse(chatId)
  if (!(await getChat(chatId))) throw new Error("Chat not found.")
}

export async function startChatSession({ chatId }: { chatId: string }) {
  await authorizeChat(chatId)
  const result = await startSession({ chatId })
  logger.info("Chat session started", { chat_id: chatId })
  return result
}

export async function mintChatAccessToken(chatId: string) {
  await authorizeChat(chatId)
  return triggerAuth.createPublicToken({
    scopes: { read: { sessions: chatId }, write: { sessions: chatId } },
    expirationTime: "1h",
  })
}

export async function loadChatTranscript({ chatId }: { chatId: string }) {
  await authorizeChat(chatId)
  const result = await loadTranscript({ chatId })
  logger.info("Chat transcript loaded", { chat_id: chatId })
  return result
}
