"use client"

import {
  createContext,
  useContext,
  useId,
  useState,
  type ReactNode,
} from "react"
import { useIsMobile } from "@/hooks/use-mobile"
import { usePanelRef } from "react-resizable-panels"

import { SandboxDesktop } from "@/components/sandbox-desktop"

import {
  ResizablePanel,
  ResizablePanelGroup,
  ResizableHandle,
} from "@/components/ui/resizable"

const ChatDesktopContext = createContext<{
  panelRef: ReturnType<typeof usePanelRef>
  panelId: string
  open: boolean
  setOpen: (open: boolean) => void
} | null>(null)

export function ChatDesktopProvider({ children }: { children: ReactNode }) {
  const panelRef = usePanelRef()
  const panelId = useId()
  const [open, setOpen] = useState(false)

  return (
    <ChatDesktopContext value={{ panelRef, panelId, open, setOpen }}>
      {children}
    </ChatDesktopContext>
  )
}

export function useChatDesktop() {
  const context = useContext(ChatDesktopContext)
  if (!context) throw new Error("ChatDesktopProvider is required")
  return context
}

export function ChatDesktopPanel({
  chatId,
  name,
}: {
  chatId: string
  name: string
}) {
  const [activated, setActivated] = useState(false)
  const { panelRef, panelId, setOpen } = useChatDesktop()

  return (
    <ResizablePanel
      id={panelId}
      panelRef={panelRef}
      collapsible
      collapsedSize="0%"
      defaultSize="0%"
      minSize="30%"
      maxSize="70%"
      onResize={(size) => {
        const visible = size.asPercentage > 0
        setOpen(visible)
        if (visible) setActivated(true)
      }}
    >
      <div className="h-full min-h-0 overflow-hidden">
        {activated && <SandboxDesktop chatId={chatId} name={name} />}
      </div>
    </ResizablePanel>
  )
}

export function ChatWorkspace({
  chatId,
  name,
  children,
}: {
  chatId: string
  name: string
  children: ReactNode
}) {
  const mobile = useIsMobile()
  return (
    <ResizablePanelGroup orientation={mobile ? "vertical" : "horizontal"}>
      <ResizablePanel defaultSize="100%" minSize="30%">
        {children}
      </ResizablePanel>
      <ResizableHandle withHandle />
      <ChatDesktopPanel chatId={chatId} name={name} />
    </ResizablePanelGroup>
  )
}
