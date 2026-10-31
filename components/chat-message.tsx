"use client"

import { Fragment, useState, type ReactNode } from "react"
import Image from "next/image"
import { isToolUIPart, getToolName, type UIMessage } from "ai"
import { BrainIcon, CheckIcon, CopyIcon } from "lucide-react"
import { ChatAvatar } from "@/components/chat-avatar"
import type { ChatBot } from "@/queries/chats"
import { MessageResponse } from "@/components/ai-elements/message"
import { ChatTool, ChatToolActivity } from "@/components/chat-tool"
import { Badge } from "@/components/ui/badge"
import { Bubble, BubbleContent } from "@/components/ui/bubble"
import { Button } from "@/components/ui/button"
import { Marker, MarkerContent, MarkerIcon } from "@/components/ui/marker"
import {
  Message,
  MessageAvatar,
  MessageContent,
  MessageFooter,
  MessageHeader,
} from "@/components/ui/message"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"

export function ChatMessage({
  message,
  members,
  streaming,
}: {
  message: UIMessage
  members?: ChatBot[]
  streaming: boolean
}) {
  const target = message.parts.find((part) => part.type === "data-target-bot")
  const targetBot =
    message.role === "user" && target && "data" in target
      ? members?.find((bot) => bot.id === target.data)
      : undefined
  const avatar =
    members && message.role === "assistant"
      ? message.parts.findLast((part) => part.type === "data-bot-avatar")
      : undefined
  const avatarSeed =
    avatar && "data" in avatar && typeof avatar.data === "string"
      ? avatar.data
      : undefined
  const identity =
    members && message.role === "assistant"
      ? message.parts.findLast((part) => part.type === "data-bot-identity")
      : undefined
  const identityId =
    identity && "data" in identity && typeof identity.data === "string"
      ? identity.data
      : undefined
  const speaker =
    members?.find((bot) => bot.id === identityId) ??
    members?.find((bot) => bot.avatar === avatarSeed)
  const handoff =
    members && message.role === "assistant"
      ? message.parts.findLast(
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
  const handoffReason =
    handoffOutput &&
    typeof handoffOutput === "object" &&
    "reason" in handoffOutput &&
    typeof handoffOutput.reason === "string"
      ? handoffOutput.reason
      : undefined
  const sourceAvatar =
    handoffOutput &&
    typeof handoffOutput === "object" &&
    "fromAvatar" in handoffOutput &&
    typeof handoffOutput.fromAvatar === "string"
      ? handoffOutput.fromAvatar
      : undefined
  const visibleParts = message.parts.filter((part, index) => {
    if (handoffName && handoff && index < message.parts.indexOf(handoff))
      return false
    if (part.type === "text" || part.type === "reasoning")
      return Boolean(part.text.trim())
    return isToolUIPart(part) && !(handoffName && part === handoff)
  })
  const routineTools = visibleParts.filter(isToolUIPart).filter((part) => {
    if (
      !["input-streaming", "input-available", "output-available"].includes(
        part.state
      )
    )
      return false
    const output = part.output
    if (output && typeof output === "object") {
      if ("error" in output) return false
      if (
        ["viewScreen", "desktopActions"].includes(getToolName(part)) &&
        "showInChat" in output &&
        output.showInChat === true
      )
        return false
    }
    return true
  })
  const user = message.role === "user"
  const text = visibleParts
    .map((part) => (part.type === "text" ? part.text : ""))
    .filter(Boolean)
    .join("\n\n")

  // Text parts stand alone; consecutive reasoning/tool rows share one Trace.
  const blocks: ReactNode[] = []
  let run: ReactNode[] = []
  // Routine tools between two text parts collapse into one activity row.
  let activity: typeof routineTools | undefined
  const endRun = () => {
    if (run.length)
      blocks.push(<Trace key={`trace-${blocks.length}`}>{run}</Trace>)
    run = []
    activity = undefined
  }
  visibleParts.forEach((part, index) => {
    if (part.type === "text") {
      endRun()
      blocks.push(
        user ? (
          <Bubble key={index} align="end">
            <BubbleContent>{part.text}</BubbleContent>
          </Bubble>
        ) : (
          <MessageResponse
            key={index}
            isAnimating={streaming}
            className="text-sm/relaxed"
          >
            {part.text}
          </MessageResponse>
        )
      )
      return
    }
    if (part.type === "reasoning") {
      const thinking = part.state === "streaming"
      run.push(
        <TraceCollapsible key={index}>
          <TraceCollapsibleTrigger>
            <TraceLine status={thinking ? "running" : undefined}>
              <TraceIcon>
                <BrainIcon />
              </TraceIcon>
              <TraceTitle>{thinking ? "Thinking" : "Thought"}</TraceTitle>
            </TraceLine>
          </TraceCollapsibleTrigger>
          <TraceCollapsibleContent className="whitespace-pre-wrap">
            {part.text}
          </TraceCollapsibleContent>
        </TraceCollapsible>
      )
      return
    }
    if (!isToolUIPart(part)) return
    if (routineTools.includes(part)) {
      if (!activity) {
        activity = []
        run.push(
          <ChatToolActivity key={`tool-activity-${index}`} parts={activity} />
        )
      }
      activity.push(part)
      return
    }
    const screenshot = ["viewScreen", "desktopActions"].includes(
      getToolName(part)
    )
    const output =
      screenshot && part.state === "output-available"
        ? (part.output as { screenshot?: unknown; showInChat?: unknown })
        : undefined
    if (output?.showInChat === true && typeof output.screenshot === "string") {
      endRun()
      blocks.push(
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
      return
    }
    run.push(
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
  })
  endRun()

  return (
    <Fragment>
      {handoffName && (
        <Marker role="status" variant="separator">
          {sourceAvatar && (
            <MarkerIcon>
              <ChatAvatar seed={sourceAvatar} className="size-4" />
            </MarkerIcon>
          )}
          <MarkerContent>
            Handed off to {handoffName}
            {handoffReason && ` · ${handoffReason}`}
          </MarkerContent>
        </Marker>
      )}
      {visibleParts.length > 0 && (
        <Message align={user ? "end" : "start"}>
          {members && !user && avatarSeed && (
            <MessageAvatar>
              <ChatAvatar seed={avatarSeed} />
            </MessageAvatar>
          )}
          <MessageContent>
            {members && !user && speaker && (
              <MessageHeader>{speaker.name}</MessageHeader>
            )}
            {targetBot && (
              <MessageHeader>
                <Badge variant="outline" title={targetBot.name}>
                  <ChatAvatar seed={targetBot.avatar} className="size-3.5" />
                  <span className="truncate">To {targetBot.name}</span>
                </Badge>
              </MessageHeader>
            )}
            {blocks}
            {!user && text && !streaming && (
              <MessageFooter>
                <CopyButton text={text} />
              </MessageFooter>
            )}
          </MessageContent>
        </Message>
      )}
    </Fragment>
  )
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  return (
    <Button
      variant="ghost"
      size="icon-xs"
      aria-label="Copy message"
      title="Copy message"
      onClick={() =>
        void navigator.clipboard.writeText(text).then(() => {
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        })
      }
    >
      {copied ? <CheckIcon /> : <CopyIcon />}
      <span className="sr-only" aria-live="polite">
        {copied ? "Message copied to clipboard" : ""}
      </span>
    </Button>
  )
}
