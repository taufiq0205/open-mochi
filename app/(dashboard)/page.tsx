import Link from "next/link"
import { getUserChats } from "@/queries/chats"
import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { SidebarTrigger } from "@/components/ui/sidebar"
import { ArrowUpRightIcon } from "lucide-react"

export default async function Page() {
  const chats = await getUserChats()
  return (
    <main className="flex min-h-svh flex-col">
      <header className="flex h-14 items-center gap-3 border-b px-4 text-xs text-muted-foreground">
        <SidebarTrigger /> Workspace
      </header>
      <div className="mx-auto w-full max-w-4xl px-6 py-12 sm:px-10 sm:py-16">
        <p className="mb-3 text-xs text-muted-foreground">Your workspace</p>
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <h1 className="text-3xl font-medium tracking-tight">
              {chats.length
                ? "Pick up where you left off."
                : "Give your ideas a collaborator."}
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-muted-foreground">
              {chats.length
                ? "Your bots, conversations, and shared work, all in one place."
                : "Create a bot with its own instructions, memory, and workspace. Then start a conversation."}
            </p>
          </div>
          <BotDialog />
        </div>
        <div className="mt-10 divide-y divide-border border-y border-border">
          {chats.map((chat) => (
            <Link
              key={chat.id}
              href={`/chats/${chat.id}`}
              className="group flex items-center gap-4 py-5 transition-colors hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring motion-reduce:transition-none"
            >
              {chat.kind === "group" ? (
                <GroupChatAvatar members={chat.members} className="size-10" />
              ) : (
                <ChatAvatar
                  seed={chat.botAvatar ?? chat.id}
                  className="size-10"
                />
              )}
              <div className="min-w-0 flex-1">
                <h2 className="truncate text-sm font-medium">
                  {chat.name ?? chat.botName ?? "Untitled chat"}
                </h2>
                <p className="mt-1 truncate text-xs text-muted-foreground">
                  {chat.lastMessagePreview ||
                    (chat.kind === "group"
                      ? "Group conversation"
                      : "Ready for your next task")}
                </p>
              </div>
              <span className="hidden text-[10px] text-muted-foreground sm:block">
                {chat.kind === "group"
                  ? `${chat.members.length} bots`
                  : "Private bot"}
              </span>
              <ArrowUpRightIcon
                aria-hidden="true"
                className="mr-2 size-4 text-muted-foreground"
              />
            </Link>
          ))}
        </div>
        {!chats.length && (
          <p className="mt-5 text-xs text-muted-foreground">
            Single-bot chats include a sandbox desktop. Group chats keep the
            focus on conversation.
          </p>
        )}
      </div>
    </main>
  )
}
