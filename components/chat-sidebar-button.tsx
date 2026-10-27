"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { SidebarMenuButton, useSidebar } from "@/components/ui/sidebar"

export function ChatSidebarButton({
  chatId,
  name,
  children,
}: {
  chatId: string
  name: string
  children: ReactNode
}) {
  const { setOpenMobile } = useSidebar()
  const href = `/chats/${chatId}`
  const isActive = usePathname() === href

  return (
    <SidebarMenuButton
      onClick={() => setOpenMobile(false)}
      size="lg"
      className="h-auto min-h-14 rounded-lg px-2.5 py-2.5 group-data-[collapsible=icon]:min-h-8 group-data-[collapsible=icon]:justify-center"
      aria-label={name}
      tooltip={name}
      isActive={isActive}
      render={<Link href={href} aria-current={isActive ? "page" : undefined} />}
    >
      {children}
    </SidebarMenuButton>
  )
}
