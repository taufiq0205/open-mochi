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
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
} from "@/components/ui/sidebar"

export async function AppSidebar() {
  const [chats, bots] = await Promise.all([getUserChats(), getUserBots()])

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
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
        <SidebarGroup>
          <SidebarGroupLabel>Chats</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {chats.map((chat) => (
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
                          className="shrink-0 text-xs text-muted-foreground"
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
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<div />}
              className="p-0 group-data-[collapsible=icon]:p-0! has-[:focus-visible]:ring-2"
            >
              <AccountButton />
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail tabIndex={0} />
    </Sidebar>
  )
}
