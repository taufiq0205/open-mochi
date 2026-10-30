"use client"

// Adapted from Beautiful UI ToolChips, MIT (c) 2026 Shane Levine.
// See components/beautiful-ui-LICENSE. Status comes from the SDK, never a timer.
import { getToolName } from "ai"
import {
  CheckIcon,
  ChevronDownIcon,
  CircleDashedIcon,
  ClockIcon,
  XIcon,
} from "lucide-react"
import { Task, TaskContent, TaskTrigger } from "@/components/ai-elements/task"
import { CollapsibleTrigger } from "@/components/ui/collapsible"
import {
  Tool,
  ToolContent,
  ToolInput,
  ToolOutput,
  type ToolPart,
} from "@/components/ai-elements/tool"

const labels: Record<ToolPart["state"], string> = {
  "input-streaming": "Preparing",
  "input-available": "Running",
  "approval-requested": "Needs approval",
  "approval-responded": "Approval received",
  "output-available": "Completed",
  "output-error": "Failed",
  "output-denied": "Denied",
}

export function ChatTool({
  part,
  output,
}: {
  part: ToolPart
  output: unknown
}) {
  const running =
    part.state === "input-streaming" || part.state === "input-available"
  const failed = part.state === "output-error" || part.state === "output-denied"
  const Icon = running
    ? CircleDashedIcon
    : failed
      ? XIcon
      : part.state === "output-available"
        ? CheckIcon
        : ClockIcon
  return (
    <Tool className="chat-tool group/tool my-1 rounded-lg border-0">
      <CollapsibleTrigger className="group/row flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring">
        <Icon
          aria-hidden="true"
          className={`size-3.5 shrink-0 ${running ? "animate-spin motion-reduce:animate-none" : ""} ${failed ? "text-destructive" : "text-muted-foreground"}`}
        />
        <span className="shrink-0 font-medium">
          {getToolName(part).replace(/([a-z])([A-Z])/g, "$1 $2")}
        </span>
        <span
          className={`min-w-0 truncate rounded border border-border/60 bg-muted/50 px-2 py-0.5 font-mono text-[11px] ${failed ? "text-destructive" : "text-muted-foreground"}`}
        >
          {labels[part.state]}
        </span>
        <ChevronDownIcon
          aria-hidden="true"
          className="ml-auto size-3.5 shrink-0 text-muted-foreground transition-transform group-data-[state=open]/tool:rotate-180 motion-reduce:transition-none"
        />
      </CollapsibleTrigger>
      <ToolContent className="ml-3 space-y-3 border-l border-border p-3 text-foreground motion-reduce:animate-none">
        {part.input !== undefined && <ToolInput input={part.input} />}
        <ToolOutput output={output} errorText={part.errorText} />
      </ToolContent>
    </Tool>
  )
}

export function ChatToolActivity({ parts }: { parts: ToolPart[] }) {
  const running = parts.findLast(
    (part) =>
      part.state === "input-streaming" || part.state === "input-available"
  )
  const actions = `${parts.length} action${parts.length === 1 ? "" : "s"}`
  const title = running ? `Working · ${actions}` : `${actions} completed`
  const Icon = running ? CircleDashedIcon : CheckIcon
  return (
    <Task defaultOpen={false} className="my-1 min-w-0">
      <TaskTrigger
        title={title}
        className="flex min-h-9 w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring"
      >
        <Icon
          aria-hidden="true"
          className={`size-3.5 shrink-0 ${running ? "animate-spin motion-reduce:animate-none" : ""}`}
        />
        <span role="status" className="shrink-0">
          {title}
        </span>
        {running && (
          <span className="truncate">
            {getToolName(running).replace(/([a-z])([A-Z])/g, "$1 $2")}
          </span>
        )}
        <ChevronDownIcon
          aria-hidden="true"
          className="ml-auto size-3.5 shrink-0 transition-transform group-aria-expanded:rotate-180 motion-reduce:transition-none"
        />
      </TaskTrigger>
      <TaskContent className="max-h-80 overflow-y-auto pr-1 motion-reduce:animate-none">
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
      </TaskContent>
    </Task>
  )
}
