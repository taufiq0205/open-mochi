"use client"

import { useState } from "react"
import { PlusIcon, UsersIcon } from "lucide-react"
import { BotDialog } from "@/components/bot-dialog"
import { GroupChatDialog } from "@/components/group-chat-dialog"
import { Button } from "@/components/ui/button"
import { DialogTrigger } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import type { ChatBot } from "@/queries/chats"

export function CreateChatMenu({ bots }: { bots: ChatBot[] }) {
  const [groupOpen, setGroupOpen] = useState(false)
  return (
    <div className="flex">
      <BotDialog>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="outline"
                className="w-full justify-start gap-2 border-border bg-background text-xs shadow-sm group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:p-0"
                aria-label="Create new chat"
              />
            }
          >
            <PlusIcon aria-hidden="true" />
            <span className="group-data-[collapsible=icon]:hidden">
              New conversation
            </span>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuGroup>
              <DialogTrigger
                nativeButton={false}
                render={<DropdownMenuItem />}
                role="menuitem"
              >
                <PlusIcon aria-hidden="true" />
                Create new bot
              </DialogTrigger>
              <DropdownMenuItem
                onClick={() => {
                  setGroupOpen(true)
                }}
              >
                <UsersIcon aria-hidden="true" />
                Create a group chat
              </DropdownMenuItem>
            </DropdownMenuGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      </BotDialog>
      <GroupChatDialog
        bots={bots}
        open={groupOpen}
        onOpenChange={setGroupOpen}
      />
    </div>
  )
}
