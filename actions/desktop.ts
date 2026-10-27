"use server"

import { logger } from "@sentry/core"
import { requireSession } from "@/lib/session"
import { z } from "zod"

import { getChat } from "@/queries/chats"
import { openSandbox } from "@/lib/sandbox"

export async function connectDesktop(chatId: unknown) {
  const { userId } = await requireSession()
  const id = z.string().min(1).max(100).safeParse(chatId)
  if (!id.success) return { error: "Invalid chat. Refresh and try again." }

  try {
    const chat = await getChat(id.data)
    if (chat?.kind === "group" || !chat?.botSandboxId)
      return {
        error: "This bot has no desktop. Create a new bot to get a desktop.",
      }
    const sandbox = await openSandbox(userId, chat.botSandboxId)
    await sandbox.computerUse.start()
    const preview = await sandbox.getSignedPreviewUrl(6080, 300)
    const url = new URL("/websockify", preview.url)
    url.protocol = "wss:"
    logger.info("Desktop connection prepared")
    return { url: url.toString() }
  } catch {
    logger.error("Desktop connection failed")
    return { error: "Could not connect to the desktop. Please retry." }
  }
}
