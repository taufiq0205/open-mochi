"use client"

import { useEntitlement } from "@/lib/auth-client"
import { showUpgradeToast } from "@/components/upgrade-toast"
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
  const { paid } = useEntitlement()
  const [groupOpen, setGroupOpen] = useState(false)
  return (
    <div className="flex justify-end">
      <BotDialog>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                variant="ghost"
                size="icon"
                aria-label="Create new chat"
              />
            }
          >
            <PlusIcon aria-hidden="true" />
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
                  if (!paid) return showUpgradeToast()
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
