import { notFound } from "next/navigation"

import { getChat, getUserBots } from "@/queries/chats"
import { ChatHeader } from "@/components/chat-header"
import { Chat } from "@/components/chat"
import { ChatWorkspace, ChatDesktopProvider } from "@/components/chat-desktop"

export default async function Page({
  params,
}: {
  params: Promise<{ chatId: string }>
}) {
  const { chatId } = await params
  const chat = await getChat(chatId)

  if (!chat) notFound()

  if (chat.kind === "group") {
    const bots = await getUserBots()
    return (
      <ChatDesktopProvider key={chatId}>
        <div className="flex h-dvh min-h-0 min-w-0 flex-col overflow-hidden">
          <ChatHeader chat={chat} bots={bots} />
          <Chat key={chatId} chatId={chatId} members={chat.members} />
        </div>
      </ChatDesktopProvider>
    )
  }

  return (
    <ChatDesktopProvider key={chatId}>
      <div className="h-dvh min-w-0 overflow-hidden">
        <ChatWorkspace chatId={chatId} name={chat.botName ?? "Bot"}>
          <div className="flex h-full min-h-0 w-full min-w-0 flex-col overflow-hidden">
            <ChatHeader chat={chat} />
            <Chat key={chatId} chatId={chatId} />
          </div>
        </ChatWorkspace>
      </div>
    </ChatDesktopProvider>
  )
}
