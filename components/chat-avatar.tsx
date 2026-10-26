import { Avatar, Style } from "@dicebear/core"
import bottts from "@dicebear/styles/bottts.json" with { type: "json" }
import Image from "next/image"

import { cn } from "@/lib/utils"

const style = new Style(bottts)

export function ChatAvatar({
  seed,
  animated = false,
  className,
}: {
  seed: string
  animated?: boolean
  className?: string
}) {
  const avatar = new Avatar(style, {
    seed,
    tags: animated ? ["animation"] : [],
  })

  return (
    <Image
      src={avatar.toDataUri()}
      alt="Bot avatar"
      width={32}
      height={32}
      className={cn("size-8 shrink-0", className)}
      unoptimized
    />
  )
}
