"use client"

import { UserButton } from "@clerk/nextjs"
import { ChartNoAxesColumnIncreasingIcon } from "lucide-react"

export function AccountButton() {
  return (
    <UserButton
      showName
      appearance={{
        elements: {
          rootBox: "w-full! min-w-0",
          userButtonTrigger:
            "w-full! h-8! rounded-md! p-2! bg-transparent! text-inherit! shadow-none! outline-none! hover:bg-transparent! active:bg-transparent! group-data-[collapsible=icon]:p-1!",
          userButtonBox:
            "w-full! min-w-0 flex-row-reverse! gap-2! group-data-[collapsible=icon]:justify-center! group-data-[collapsible=icon]:gap-0!",
          userButtonAvatarBox: "size-6! shrink-0",
          userButtonOuterIdentifier:
            "min-w-0 flex-1 truncate p-0! text-left text-sm! font-normal! text-inherit! group-data-[collapsible=icon]:hidden!",
        },
      }}
    >
      <UserButton.MenuItems>
        <UserButton.Link
          label="Usage"
          labelIcon={<ChartNoAxesColumnIncreasingIcon />}
          href="/usage"
        />
      </UserButton.MenuItems>
    </UserButton>
  )
}
