"use server"

import { logger } from "@sentry/core"
import { requireSession } from "@/lib/session"
import { z } from "zod"

import { getChat } from "@/queries/chats"
import { openSandbox } from "@/lib/sandbox"
import {
  sandboxConfig,
  DESKTOP_PASSWORD_PATH,
  sandboxFiles,
} from "@/lib/opensandbox.mjs"
import { sealDesktopTicket } from "@/lib/desktop-ticket.mjs"

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
    let target: URL
    let password: string
    try {
      target = new URL(await sandbox.getEndpointUrl(6080))
      target.pathname = target.pathname.replace(/\/$/, "") + "/websockify"
      target.protocol = target.protocol === "http:" ? "ws:" : "wss:"
      password = await sandboxFiles(sandbox).readFile(DESKTOP_PASSWORD_PATH, {
        limit: 100,
      })
    } finally {
      await sandbox.close()
    }
    const ticket = sealDesktopTicket(target.toString(), {
      "OPEN-SANDBOX-API-KEY": sandboxConfig().apiKey,
    })
    const url = new URL(process.env.DESKTOP_PROXY_URL || "ws://localhost:3001")
    url.searchParams.set("ticket", ticket)
    logger.info("Desktop connection prepared")
    return { url: url.toString(), password }
  } catch {
    logger.error("Desktop connection failed")
    return { error: "Could not connect to the desktop. Please retry." }
  }
}
