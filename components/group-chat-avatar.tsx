import { ChatAvatar } from "@/components/chat-avatar"
import { cn } from "@/lib/utils"
import type { ChatBot } from "@/queries/chats"

export function GroupChatAvatar({
  members,
  className,
}: {
  members: ChatBot[]
  className?: string
}) {
  const slots = Math.min(members.length, 4)
  const positions =
    slots === 2
      ? ["left-0 top-1/4", "right-0 top-1/4"]
      : slots === 3
        ? ["left-1/4 top-0", "bottom-0 left-0", "bottom-0 right-0"]
        : [
            "left-0 top-0",
            "right-0 top-0",
            "bottom-0 left-0",
            "bottom-0 right-0",
          ]
  return (
    <span
      role="img"
      aria-label={`Group chat: ${members.map((bot) => bot.name).join(", ")}`}
      className={cn("relative block size-8 shrink-0", className)}
    >
      {members.slice(0, 3).map((bot, index) => (
        <span
          key={bot.id}
          aria-hidden="true"
          className={cn(
            "absolute",
            slots === 1 ? "inset-0" : slots === 2 ? "size-[60%]" : "size-1/2",
            positions[index]
          )}
        >
          <ChatAvatar seed={bot.avatar} className="size-full" />
        </span>
      ))}
      {members.length > 3 && (
        <span
          aria-hidden="true"
          className="absolute right-0 bottom-0 flex size-[50%] items-center justify-center rounded-sm bg-muted text-[8px] leading-none font-medium text-muted-foreground"
        >
          +{members.length - 3}
        </span>
      )}
    </span>
  )
}
