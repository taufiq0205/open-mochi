import Link from "next/link"
import { BotIcon, ChevronRightIcon, UsersIcon } from "lucide-react"
import { getUserChats } from "@/queries/chats"
import { BotDialog } from "@/components/bot-dialog"
import { ChatAvatar } from "@/components/chat-avatar"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  Item,
  ItemActions,
  ItemContent,
  ItemDescription,
  ItemGroup,
  ItemMedia,
  ItemTitle,
} from "@/components/ui/item"
import { Separator } from "@/components/ui/separator"
import { SidebarTrigger } from "@/components/ui/sidebar"

const sections = {
  direct: {
    title: "Bots",
    icon: BotIcon,
    empty: "No bots yet",
    hint: "Create a bot to start a conversation.",
  },
  group: {
    title: "Group chats",
    icon: UsersIcon,
    empty: "No group chats yet",
    hint: "Use New chat in the sidebar to put bots in one room.",
  },
}

export default async function Page() {
  const chats = await getUserChats()
  return (
    <main className="flex min-h-svh flex-col">
      <header className="flex h-12 shrink-0 items-center gap-2 border-b px-4">
        <SidebarTrigger />
        <Separator orientation="vertical" className="h-4" />
        <h1 className="text-sm font-medium">Home</h1>
        <div className="ml-auto">
          <BotDialog />
        </div>
      </header>
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-10 px-4 py-8 sm:px-6">
        {(["direct", "group"] as const).map((kind) => {
          const section = sections[kind]
          const items = chats.filter((chat) => chat.kind === kind)
          return (
            <section
              key={kind}
              aria-labelledby={`section-${kind}`}
              className="flex flex-col gap-3"
            >
              <h2
                id={`section-${kind}`}
                className="font-heading text-sm font-medium text-muted-foreground"
              >
                {section.title} · {items.length}
              </h2>
              {items.length ? (
                <ItemGroup className="gap-2">
                  {items.map((chat) => (
                    <Item
                      key={chat.id}
                      variant="outline"
                      render={<Link href={`/chats/${chat.id}`} />}
                    >
                      <ItemMedia>
                        {chat.kind === "group" ? (
                          <GroupChatAvatar
                            members={chat.members}
                            className="size-9"
                          />
                        ) : (
                          <ChatAvatar
                            seed={chat.botAvatar ?? chat.id}
                            className="size-9"
                          />
                        )}
                      </ItemMedia>
                      <ItemContent>
                        <ItemTitle>
                          {chat.name ?? chat.botName ?? "Untitled chat"}
                        </ItemTitle>
                        <ItemDescription className="line-clamp-1">
                          {chat.lastMessagePreview ||
                            (chat.kind === "group"
                              ? `${chat.members.length} bots`
                              : "No messages yet")}
                        </ItemDescription>
                      </ItemContent>
                      <ItemActions>
                        <ChevronRightIcon className="text-muted-foreground" />
                      </ItemActions>
                    </Item>
                  ))}
                </ItemGroup>
              ) : (
                <Empty className="border border-dashed">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <section.icon />
                    </EmptyMedia>
                    <EmptyTitle>{section.empty}</EmptyTitle>
                    <EmptyDescription>{section.hint}</EmptyDescription>
                  </EmptyHeader>
                </Empty>
              )}
            </section>
          )
        })}
      </div>
    </main>
  )
}
