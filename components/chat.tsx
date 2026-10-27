"use client"

import { logger } from "@sentry/core"
import { useChat } from "@ai-sdk/react"
import {
  useLoadTranscript,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react"
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat"
import { isToolUIPart, getToolName, type UIMessage } from "ai"
import { ChatAvatar } from "@/components/chat-avatar"
import type { ChatBot } from "@/queries/chats"
import { DropdownMenuGroup } from "@/components/ui/dropdown-menu"
import { ChevronDownIcon } from "lucide-react"
import { Fragment, useEffect, useState } from "react"
import Image from "next/image"

import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation"
import {
  Message,
  MessageContent,
  MessageResponse,
} from "@/components/ai-elements/message"
import { ChatTool } from "@/components/chat-tool"
import {
  Reasoning,
  ReasoningTrigger,
  ReasoningContent,
} from "@/components/ai-elements/reasoning"
import {
  PromptInput,
  PromptInputActionMenu,
  PromptInputActionMenuTrigger,
  PromptInputActionMenuContent,
  PromptInputActionMenuItem,
  PromptInputBody,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input"
import {
  loadChatTranscript,
  mintChatAccessToken,
  startChatSession,
} from "@/actions/chat"
import type { chatAgent } from "@/trigger/chat"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export function Chat({
  chatId,
  members,
}: {
  chatId: string
  members?: ChatBot[]
}) {
  const [selectedBotId, setBotId] = useState(members?.[0]?.id)
  const botId = members?.some((bot) => bot.id === selectedBotId)
    ? selectedBotId
    : members?.[0]?.id
  const transport = useTriggerChatTransport<typeof chatAgent>({
    task: "chat-agent",
    clientData: { botId },
    accessToken: ({ chatId }) => mintChatAccessToken(chatId),
    startSession: ({ chatId }) => startChatSession({ chatId }),
  })
  const { messages, isLoading, error } = useLoadTranscript(
    chatId,
    loadChatTranscript,
    { transport }
  )
  if (isLoading)
    return (
      <p role="status" className="p-4">
        Loading messages…
      </p>
    )
  if (error)
    return (
      <Alert variant="destructive">
        <AlertDescription>
          Could not load messages. Please reload to try again.
        </AlertDescription>
      </Alert>
    )
  return (
    <ChatView
      chatId={chatId}
      members={members}
      botId={botId}
      onBotChange={setBotId}
      initialMessages={messages}
      transport={transport}
    />
  )
}

function ChatView({
  chatId,
  members,
  botId,
  onBotChange,
  initialMessages,
  transport,
}: {
  chatId: string
  members?: ChatBot[]
  botId?: string
  onBotChange: (id: string) => void
  initialMessages: UIMessage[]
  transport: TriggerChatTransport
}) {
  const [text, setText] = useState("")
  const [connectionError, setConnectionError] = useState(false)
  const {
    messages,
    sendMessage,
    status,
    error,
    regenerate,
    stop,
    resumeStream,
  } = useChat({
    id: chatId,
    messages: initialMessages,
    transport,
    onError: () => {
      logger.warn("Chat client received an error", { chat_id: chatId })
    },
  })
  useEffect(() => {
    if (initialMessages.length === 0) return
    let cancelled = false
    void transport
      .start(chatId)
      .then(async () => {
        if (!cancelled) await resumeStream()
      })
      .catch(() => {
        if (!cancelled) {
          logger.error("Chat stream reconnection failed", { chat_id: chatId })
          setConnectionError(true)
        }
      })
    return () => {
      cancelled = true
    }
  }, [chatId, initialMessages.length, transport, resumeStream])
  const pending = status === "submitted" || status === "streaming"

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <Conversation className="min-h-0 overflow-x-hidden">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-7 px-5 py-8 sm:px-8">
          {messages.length === 0 && (
            <ConversationEmptyState
              title="Start with a task"
              description="Ask a question, explore an idea, or give your bot something to work on."
            />
          )}
          {messages.map((message) => {
            const target = message.parts.find(
              (part) => part.type === "data-target-bot"
            )
            const targetBot =
              message.role === "user" && target && "data" in target
                ? members?.find((bot) => bot.id === target.data)
                : undefined
            const avatar =
              members && message.role === "assistant"
                ? message.parts.findLast(
                    (part) => part.type === "data-bot-avatar"
                  )
                : undefined
            const handoff =
              members && message.role === "assistant"
                ? message.parts.find(
                    (part) =>
                      isToolUIPart(part) &&
                      getToolName(part) === "handoff" &&
                      part.state === "output-available"
                  )
                : undefined
            const handoffOutput =
              handoff && isToolUIPart(handoff) ? handoff.output : undefined
            const handoffName =
              handoffOutput &&
              typeof handoffOutput === "object" &&
              "name" in handoffOutput &&
              typeof handoffOutput.name === "string"
                ? handoffOutput.name
                : undefined
            const sourceAvatar =
              handoffOutput &&
              typeof handoffOutput === "object" &&
              "fromAvatar" in handoffOutput &&
              typeof handoffOutput.fromAvatar === "string"
                ? handoffOutput.fromAvatar
                : undefined
            const visibleParts = message.parts.filter((part, index) => {
              if (
                handoffName &&
                handoff &&
                index < message.parts.indexOf(handoff)
              )
                return false
              if (part.type === "text" || part.type === "reasoning")
                return Boolean(part.text.trim())
              return isToolUIPart(part) && !(handoffName && part === handoff)
            })
            return (
              <Fragment key={message.id}>
                {handoffName && (
                  <div
                    role="status"
                    className="flex items-center gap-3 text-sm text-muted-foreground"
                  >
                    {sourceAvatar && <ChatAvatar seed={sourceAvatar} />}
                    <span>Handed off to {handoffName}</span>
                  </div>
                )}
                {visibleParts.length > 0 && (
                  <Message
                    key={message.id}
                    from={message.role}
                    className={
                      members && message.role === "assistant"
                        ? "flex-row items-start gap-3"
                        : undefined
                    }
                  >
                    {avatar &&
                      "data" in avatar &&
                      typeof avatar.data === "string" && (
                        <ChatAvatar seed={avatar.data} />
                      )}
                    <MessageContent>
                      {visibleParts.map((part, index) => {
                        if (part.type === "reasoning")
                          return (
                            <Reasoning
                              key={index}
                              isStreaming={part.state === "streaming"}
                              className="my-1"
                            >
                              <ReasoningTrigger
                                getThinkingMessage={(streaming) =>
                                  streaming ? "Thinking…" : "Reasoning"
                                }
                                className="min-h-9 rounded-md px-2 text-xs hover:bg-muted/60 motion-reduce:transition-none"
                              />
                              <ReasoningContent className="ml-3 border-l pl-4 text-xs motion-reduce:animate-none">
                                {part.text}
                              </ReasoningContent>
                            </Reasoning>
                          )
                        if (part.type === "text" && index === 0 && targetBot)
                          return (
                            <div key={index} className="flex items-start gap-2">
                              <Badge
                                variant="outline"
                                className="h-6 max-w-[min(10rem,50%)] gap-1.5 px-1.5 py-0 text-sm"
                                title={targetBot.name}
                              >
                                <ChatAvatar
                                  seed={targetBot.avatar}
                                  className="size-3.5 rounded-full"
                                />
                                <span className="truncate">
                                  {targetBot.name}
                                </span>
                              </Badge>
                              <MessageResponse className="min-w-0 flex-1 leading-6">
                                {part.text}
                              </MessageResponse>
                            </div>
                          )
                        if (part.type === "text")
                          return (
                            <MessageResponse
                              key={index}
                              isAnimating={
                                status === "streaming" &&
                                message.id === messages.at(-1)?.id
                              }
                            >
                              {part.text}
                            </MessageResponse>
                          )
                        if (!isToolUIPart(part)) return null
                        const screenshot = getToolName(part) === "viewScreen"
                        const output =
                          screenshot && part.state === "output-available"
                            ? (part.output as {
                                screenshot?: unknown
                                showInChat?: unknown
                              })
                            : undefined
                        if (
                          output?.showInChat === true &&
                          typeof output.screenshot === "string"
                        )
                          return (
                            <Image
                              key={part.toolCallId}
                              src={`data:image/png;base64,${output.screenshot}`}
                              alt="Agent desktop screenshot"
                              width={1280}
                              height={720}
                              unoptimized
                              className="h-auto max-w-full rounded-md border"
                            />
                          )
                        return (
                          <ChatTool
                            key={part.toolCallId}
                            part={part}
                            output={
                              screenshot
                                ? part.state === "output-available"
                                  ? "Screen inspected."
                                  : undefined
                                : part.output
                            }
                          />
                        )
                      })}
                    </MessageContent>
                  </Message>
                )}
              </Fragment>
            )
          })}
          {status === "submitted" && (
            <p
              role="status"
              className="flex items-center gap-2 text-xs text-muted-foreground"
            >
              Working…
            </p>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-3 px-4 pt-3 pb-4 sm:px-8">
        {connectionError && (
          <Alert variant="destructive">
            <AlertDescription>
              Could not reconnect to live replies. Reload to try again.
            </AlertDescription>
          </Alert>
        )}
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              Could not get a reply. Please try again.
              <Button
                variant="outline"
                size="sm"
                onClick={() => void regenerate()}
              >
                Retry
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <PromptInput
          className="[&>[data-slot=input-group]]:rounded-2xl [&>[data-slot=input-group]]:border-input [&>[data-slot=input-group]]:bg-card [&>[data-slot=input-group]]:shadow-sm"
          onSubmit={async () => {
            if (!text.trim() || pending || (members && !botId)) return
            await sendMessage({
              parts: [
                ...(members && botId
                  ? [{ type: "data-target-bot" as const, data: botId }]
                  : []),
                { type: "text", text: text.trim() },
              ],
            })
            setText("")
          }}
        >
          <PromptInputBody>
            <PromptInputTextarea
              aria-label="Message"
              placeholder={
                members ? "Message the selected bot…" : "Give your bot a task…"
              }
              className="min-h-16 text-sm"
              value={text}
              onChange={(event) => setText(event.target.value)}
              disabled={pending}
            />
          </PromptInputBody>
          <PromptInputFooter className="justify-between">
            {!members && (
              <span className="px-1 text-xs text-muted-foreground">
                Your bot · private workspace
              </span>
            )}
            {members && (
              <PromptInputActionMenu>
                <PromptInputActionMenuTrigger
                  variant="secondary"
                  className="h-8 max-w-full gap-2 rounded-xl px-3 font-medium text-muted-foreground"
                  disabled={pending || !members.length}
                  aria-label="Choose bot to talk to"
                >
                  {botId && (
                    <ChatAvatar
                      seed={
                        members.find((bot) => bot.id === botId)?.avatar ?? botId
                      }
                      className="size-5"
                    />
                  )}
                  <span className="truncate">
                    {members.find((bot) => bot.id === botId)?.name ??
                      "No bots available"}
                  </span>
                  <ChevronDownIcon className="size-4" />
                </PromptInputActionMenuTrigger>
                <PromptInputActionMenuContent>
                  <DropdownMenuGroup>
                    {members.map((bot) => (
                      <PromptInputActionMenuItem
                        key={bot.id}
                        onClick={() => onBotChange(bot.id)}
                      >
                        <ChatAvatar seed={bot.avatar} className="size-5" />
                        {bot.name}
                      </PromptInputActionMenuItem>
                    ))}
                  </DropdownMenuGroup>
                </PromptInputActionMenuContent>
              </PromptInputActionMenu>
            )}
            <PromptInputSubmit
              status={status}
              onStop={() => {
                void stop()
                void transport.stopGeneration(chatId)
              }}
              disabled={
                !pending && (!text.trim() || Boolean(members && !botId))
              }
            />
          </PromptInputFooter>
        </PromptInput>
        <p className="text-center text-[10px] text-muted-foreground">
          Review important results before acting.
        </p>
      </div>
    </div>
  )
}
