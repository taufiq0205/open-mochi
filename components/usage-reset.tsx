"use client"

import { useEffect, useState } from "react"
import { formatDistanceStrict } from "date-fns"

export function UsageReset({ resetsAt }: { resetsAt: string }) {
  const [now, setNow] = useState<Date | null>(null)
  useEffect(() => {
    const update = () => setNow(new Date())
    update()
    const timer = setInterval(update, 30_000)
    return () => clearInterval(timer)
  }, [])
  return (
    <p className="text-sm text-muted-foreground" aria-live="polite">
      {now
        ? new Date(resetsAt) > now
          ? `Resets in ${formatDistanceStrict(new Date(resetsAt), now)}.`
          : "Your billing period has ended. Refresh to see your new allowance."
        : "Loading reset time…"}{" "}
      <time dateTime={resetsAt}>
        {new Date(resetsAt).toLocaleString("en-MY", {
          timeZone: "Asia/Kuala_Lumpur",
          dateStyle: "medium",
          timeStyle: "short",
        })}{" "}
        MYT
      </time>
    </p>
  )
}
