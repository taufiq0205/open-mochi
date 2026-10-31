"use client"

import { logger } from "@sentry/core"
import { useChat } from "@ai-sdk/react"
import {
  useLoadTranscript,
  useTriggerChatTransport,
} from "@trigger.dev/sdk/chat/react"
import type { TriggerChatTransport } from "@trigger.dev/sdk/chat"
import type { UIMessage } from "ai"
import type { ChatBot } from "@/queries/chats"
import { useEffect, useState } from "react"
import { MessageSquareIcon } from "lucide-react"
import { ChatComposer } from "@/components/chat-composer"
import { ChatMessage } from "@/components/chat-message"
import {
  loadChatTranscript,
  mintChatAccessToken,
  startChatSession,
} from "@/actions/chat"
import type { chatAgent } from "@/trigger/chat"

import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"
import {
  MessageScroller,
  MessageScrollerButton,
  MessageScrollerContent,
  MessageScrollerItem,
  MessageScrollerProvider,
  MessageScrollerViewport,
} from "@/components/ui/message-scroller"
import { Spinner } from "@/components/ui/spinner"

const suggestions = [
  "Turn a rough idea into a plan",
  "Explain something with a simple example",
  "Draft a short email",
]

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
    baseURL: process.env.NEXT_PUBLIC_TRIGGER_API_URL ?? "http://localhost:8030",
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
      <p
        role="status"
        className="flex items-center gap-2 p-4 text-sm text-muted-foreground"
      >
        <Spinner />
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
  const send = async (text: string) => {
    if (members && !botId) return
    await sendMessage({
      parts: [
        ...(members && botId
          ? [{ type: "data-target-bot" as const, data: botId }]
          : []),
        { type: "text", text },
      ],
    })
  }

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden bg-background">
      <MessageScrollerProvider autoScroll>
        <MessageScroller className="flex-1">
          <MessageScrollerViewport>
            <MessageScrollerContent className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6">
              {messages.length === 0 && (
                <Empty className="flex-1">
                  <EmptyHeader>
                    <EmptyMedia variant="icon">
                      <MessageSquareIcon />
                    </EmptyMedia>
                    <EmptyTitle>No messages yet</EmptyTitle>
                    <EmptyDescription>
                      {members
                        ? "Pick a bot below and send the first message."
                        : "Ask a question or give your bot a task."}
                    </EmptyDescription>
                  </EmptyHeader>
                  {!members && (
                    <EmptyContent className="flex-row flex-wrap justify-center">
                      {suggestions.map((text) => (
                        <Button
                          key={text}
                          variant="outline"
                          size="sm"
                          disabled={pending}
                          onClick={() => void send(text)}
                        >
                          {text}
                        </Button>
                      ))}
                    </EmptyContent>
                  )}
                </Empty>
              )}
              {messages.map((message) => (
                <MessageScrollerItem
                  key={message.id}
                  messageId={message.id}
                  scrollAnchor={message.role === "user"}
                >
                  <ChatMessage
                    message={message}
                    members={members}
                    streaming={
                      status === "streaming" &&
                      message.id === messages.at(-1)?.id
                    }
                  />
                </MessageScrollerItem>
              ))}
              {status === "submitted" && (
                <p
                  role="status"
                  className="shimmer text-xs text-muted-foreground"
                >
                  Working on a reply…
                </p>
              )}
            </MessageScrollerContent>
          </MessageScrollerViewport>
          <MessageScrollerButton />
        </MessageScroller>
      </MessageScrollerProvider>
      <div className="mx-auto flex w-full max-w-3xl shrink-0 flex-col gap-2 px-4 pt-2 pb-4 sm:px-6">
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
        <ChatComposer
          members={members}
          botId={botId}
          onBotChange={onBotChange}
          pending={pending}
          onSend={send}
          onStop={() => {
            void stop()
            void transport.stopGeneration(chatId)
          }}
        />
      </div>
    </div>
  )
}
