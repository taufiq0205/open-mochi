"use client"

import type { ReactNode } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { SidebarMenuButton } from "@/components/ui/sidebar"

export function ChatSidebarButton({
  chatId,
  name,
  children,
}: {
  chatId: string
  name: string
  children: ReactNode
}) {
  const href = `/chats/${chatId}`
  const isActive = usePathname() === href

  return (
    <SidebarMenuButton
      size="lg"
      className="group-data-[collapsible=icon]:justify-center"
      aria-label={name}
      tooltip={name}
      isActive={isActive}
      render={<Link href={href} aria-current={isActive ? "page" : undefined} />}
    >
      {children}
    </SidebarMenuButton>
  )
}
