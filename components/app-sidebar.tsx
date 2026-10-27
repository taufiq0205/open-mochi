import Link from "next/link"
import Image from "next/image"
import { AccountButton } from "@/components/account-button"
import { formatDistanceToNowStrict } from "date-fns"
import { ChatAvatar } from "@/components/chat-avatar"
import { ChatSearch } from "@/components/chat-search"
import { ChatSidebarButton } from "@/components/chat-sidebar-button"
import { GroupChatAvatar } from "@/components/group-chat-avatar"
import { CreateChatMenu } from "@/components/create-chat-menu"
import { getUserChats, getUserBots } from "@/queries/chats"
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarTrigger,
  SidebarMenu,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

export async function AppSidebar() {
  const [chats, bots] = await Promise.all([getUserChats(), getUserBots()])

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="gap-3 px-3 py-4 group-data-[collapsible=icon]:items-center group-data-[collapsible=icon]:px-2">
        <div className="flex items-center gap-2 px-1 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <Link
            href="/"
            aria-label="open-mochi home"
            className="flex min-w-0 flex-1 items-center gap-2 font-semibold tracking-tight group-data-[collapsible=icon]:flex-none"
          >
            <Image
              src="/icon.png"
              alt=""
              width={28}
              height={28}
              className="size-7 shrink-0"
            />
            <span className="truncate group-data-[collapsible=icon]:hidden">
              open-mochi
            </span>
          </Link>
          <SidebarTrigger className="text-muted-foreground group-data-[collapsible=icon]:hidden" />
        </div>
        <CreateChatMenu bots={bots} />
        <ChatSearch
          chats={chats.map((chat) => ({
            id: chat.id,
            name: chat.name ?? chat.botName ?? "Untitled chat",
            avatar:
              chat.kind === "group" ? (
                <GroupChatAvatar members={chat.members} />
              ) : (
                <ChatAvatar seed={chat.botAvatar ?? chat.id} />
              ),
          }))}
        />
      </SidebarHeader>
      <SidebarContent className="group-data-[collapsible=icon]:overflow-y-auto">
        {(["direct", "group"] as const).map((kind) => (
          <SidebarGroup key={kind}>
            <SidebarGroupLabel>
              {kind === "direct" ? "Bots" : "Group chats"}
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {chats
                  .filter((chat) => chat.kind === kind)
                  .map((chat) => (
                    <SidebarMenuItem key={chat.id}>
                      <ChatSidebarButton
                        chatId={chat.id}
                        name={chat.name ?? chat.botName ?? "Untitled chat"}
                      >
                        {chat.kind === "group" ? (
                          <GroupChatAvatar
                            members={chat.members}
                            className="group-data-[collapsible=icon]:size-6"
                          />
                        ) : (
                          <ChatAvatar
                            seed={chat.botAvatar ?? chat.id}
                            className="group-data-[collapsible=icon]:size-6"
                          />
                        )}
                        <div className="flex min-w-0 flex-1 flex-col group-data-[collapsible=icon]:hidden">
                          <div className="flex items-center gap-2">
                            <span className="min-w-0 flex-1 truncate">
                              {chat.name ?? chat.botName ?? "Untitled chat"}
                            </span>
                            <time
                              dateTime={chat.lastMessageAt.toISOString()}
                              className="shrink-0 text-[10px] text-muted-foreground"
                            >
                              {formatDistanceToNowStrict(chat.lastMessageAt)}
                            </time>
                          </div>
                          <span className="truncate text-xs text-muted-foreground">
                            {chat.lastMessagePreview}
                          </span>
                        </div>
                      </ChatSidebarButton>
                    </SidebarMenuItem>
                  ))}
              </SidebarMenu>
              {!chats.some((chat) => chat.kind === kind) && (
                <p className="px-2 py-3 text-xs text-muted-foreground group-data-[collapsible=icon]:hidden">
                  {kind === "direct"
                    ? "Create a bot to get started."
                    : "Bring your bots together in a group."}
                </p>
              )}
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border p-2 group-data-[collapsible=icon]:items-center">
        <AccountButton />
      </SidebarFooter>
      <SidebarRail tabIndex={0} />
    </Sidebar>
  )
}
