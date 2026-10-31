"use client"

// Status comes from the SDK part state, never a timer.
import { getToolName } from "ai"
import { ListChecksIcon, WrenchIcon } from "lucide-react"
import type { ToolPart } from "@/components/ai-elements/tool"
import { CodeBlock, CodeBlockContent } from "@/components/ui/code-block"
import {
  Trace,
  TraceCollapsible,
  TraceCollapsibleContent,
  TraceCollapsibleTrigger,
  TraceDescription,
  TraceIcon,
  TraceLine,
  TraceTitle,
} from "@/components/ui/trace"

const labels: Record<ToolPart["state"], string> = {
  "input-streaming": "Preparing",
  "input-available": "Running",
  "approval-requested": "Needs approval",
  "approval-responded": "Approval received",
  "output-available": "Completed",
  "output-error": "Failed",
  "output-denied": "Denied",
}

const toolTitle = (part: ToolPart) =>
  getToolName(part).replace(/([a-z])([A-Z])/g, "$1 $2")

const format = (value: unknown) =>
  typeof value === "string" ? value : JSON.stringify(value, null, 2)

export function ChatTool({
  part,
  output,
}: {
  part: ToolPart
  output: unknown
}) {
  const running =
    part.state === "input-streaming" || part.state === "input-available"
  // Failures returned as tool output count too; they stay expanded.
  const failed =
    part.state === "output-error" ||
    part.state === "output-denied" ||
    (typeof output === "object" && output !== null && "error" in output)
  const status = running
    ? "running"
    : failed
      ? "error"
      : part.state === "approval-requested"
        ? "pending"
        : undefined
  const line = (
    <TraceLine status={status}>
      <TraceIcon>
        <WrenchIcon />
      </TraceIcon>
      <TraceTitle>{toolTitle(part)}</TraceTitle>
      <TraceDescription>
        {failed && part.state === "output-available"
          ? "Failed"
          : labels[part.state]}
      </TraceDescription>
    </TraceLine>
  )
  const details = [
    part.input !== undefined && format(part.input),
    output !== undefined && format(output),
    part.errorText,
  ].filter((text): text is string => typeof text === "string" && text !== "")
  if (!details.length) return line
  return (
    <TraceCollapsible defaultOpen={failed}>
      <TraceCollapsibleTrigger>{line}</TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="flex flex-col gap-2">
        {details.map((text, index) => (
          <CodeBlock
            key={index}
            size="sm"
            variant={
              failed && index === details.length - 1 ? "destructive" : undefined
            }
          >
            <CodeBlockContent wrap className="max-h-64">
              {text}
            </CodeBlockContent>
          </CodeBlock>
        ))}
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}

export function ChatToolActivity({ parts }: { parts: ToolPart[] }) {
  const running = parts.findLast(
    (part) =>
      part.state === "input-streaming" || part.state === "input-available"
  )
  const actions = `${parts.length} action${parts.length === 1 ? "" : "s"}`
  return (
    <TraceCollapsible defaultOpen={false}>
      <TraceCollapsibleTrigger>
        <TraceLine status={running ? "running" : undefined}>
          <TraceIcon>
            <ListChecksIcon />
          </TraceIcon>
          <TraceTitle role="status">
            {running ? `Working · ${actions}` : `${actions} completed`}
          </TraceTitle>
          {running && <TraceDescription>{toolTitle(running)}</TraceDescription>}
        </TraceLine>
      </TraceCollapsibleTrigger>
      <TraceCollapsibleContent className="max-h-80 overflow-y-auto">
        <Trace>
          {parts.map((part) => (
            <ChatTool
              key={part.toolCallId}
              part={part}
              output={
                getToolName(part) === "viewScreen"
                  ? part.state === "output-available"
                    ? "Screen inspected."
                    : undefined
                  : part.output
              }
            />
          ))}
        </Trace>
      </TraceCollapsibleContent>
    </TraceCollapsible>
  )
}
