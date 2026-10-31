"use client"

import { useState } from "react"
import { ArrowUpIcon, ChevronDownIcon, SquareIcon } from "lucide-react"
import { ChatAvatar } from "@/components/chat-avatar"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupTextarea,
} from "@/components/ui/input-group"
import type { ChatBot } from "@/queries/chats"

export function ChatComposer({
  pending,
  onSend,
  onStop,
  members,
  botId,
  onBotChange,
}: {
  pending: boolean
  onSend: (text: string) => Promise<void>
  onStop: () => void
  members?: ChatBot[]
  botId?: string
  onBotChange: (id: string) => void
}) {
  const [text, setText] = useState("")
  const selectedBot = members?.find((bot) => bot.id === botId)
  const unavailable = pending || (members !== undefined && !selectedBot)
  const submit = async () => {
    if (!text.trim() || unavailable) return
    await onSend(text.trim())
    setText("")
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        void submit()
      }}
    >
      <InputGroup>
        <InputGroupTextarea
          aria-label="Message"
          placeholder={
            selectedBot ? `Message ${selectedBot.name}…` : "Message your bot…"
          }
          className="max-h-48 min-h-16 text-sm"
          value={text}
          disabled={unavailable}
          onChange={(event) => setText(event.target.value)}
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              !event.shiftKey &&
              !event.nativeEvent.isComposing
            ) {
              event.preventDefault()
              void submit()
            }
          }}
        />
        <InputGroupAddon align="block-end" className="justify-between">
          {members ? (
            <DropdownMenu>
              <DropdownMenuTrigger
                render={<InputGroupButton variant="ghost" size="sm" />}
                disabled={pending || !members.length}
                aria-label={
                  selectedBot
                    ? `Choose which bot responds next; currently ${selectedBot.name}`
                    : "Choose which bot responds next"
                }
              >
                {selectedBot && (
                  <ChatAvatar seed={selectedBot.avatar} className="size-4" />
                )}
                <span className="truncate">
                  {selectedBot?.name ??
                    (members.length ? "Choose a bot" : "No bots available")}
                </span>
                <ChevronDownIcon />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start">
                <DropdownMenuGroup>
                  <DropdownMenuLabel>Reply from</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={botId}
                    onValueChange={(id) => onBotChange(id)}
                  >
                    {members.map((bot) => (
                      <DropdownMenuRadioItem key={bot.id} value={bot.id}>
                        <ChatAvatar seed={bot.avatar} className="size-4" />
                        {bot.name}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </DropdownMenuGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <span>Enter to send · Shift+Enter for a new line</span>
          )}
          {pending ? (
            <InputGroupButton
              type="button"
              variant="default"
              size="icon-sm"
              aria-label="Stop response"
              onClick={onStop}
            >
              <SquareIcon />
            </InputGroupButton>
          ) : (
            <InputGroupButton
              type="submit"
              variant="default"
              size="icon-sm"
              aria-label="Send message"
              disabled={unavailable || !text.trim()}
            >
              <ArrowUpIcon />
            </InputGroupButton>
          )}
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}
