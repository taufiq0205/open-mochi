"use client"

import { logger } from "@sentry/core"
import { useCallback, useEffect, useRef, useState } from "react"
import { useEntitlement } from "@/lib/auth-client"
import { BILLING_ERROR } from "@/lib/billing"
import { showUpgradeToast, showUsageToast } from "@/components/upgrade-toast"
import type RFB from "@novnc/novnc"

import { connectDesktop } from "@/actions/desktop"
import { Button } from "@/components/ui/button"
import { Alert, AlertDescription } from "@/components/ui/alert"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function SandboxDesktop({
  chatId,
  name,
}: {
  chatId: string
  name: string
}) {
  const { paid } = useEntitlement()
  const preview = useRef<HTMLDivElement>(null)
  const fullscreenTarget = useRef<HTMLDivElement | null>(null)
  const screen = useRef<HTMLDivElement | null>(null)
  const client = useRef<RFB | null>(null)
  const [fullscreen, setFullscreen] = useState(false)
  const [status, setStatus] = useState<"connecting" | "connected" | "error">(
    "connecting"
  )
  const [error, setError] = useState("")
  const [attempt, setAttempt] = useState(0)

  useEffect(() => {
    if (!paid) {
      showUpgradeToast()
      return
    }
    let disposed = false
    const host = document.createElement("div")
    host.className = "size-full"
    screen.current = host
    preview.current?.appendChild(host)
    let connection: RFB | undefined

    async function connect() {
      try {
        const [result, { default: RFB }] = await Promise.all([
          connectDesktop(chatId),
          import("@novnc/novnc"),
        ])
        if (disposed) return
        if (!result.url) {
          if (result.error === BILLING_ERROR) showUpgradeToast()
          if ("usageLimit" in result && result.usageLimit)
            showUsageToast(result.error)
          setStatus("error")
          setError(
            result.error ?? "Could not connect to the desktop. Please retry."
          )
          return
        }
        connection = new RFB(host, result.url)
        client.current = connection
        connection.scaleViewport = true
        connection.viewOnly = !fullscreenTarget.current
        connection.addEventListener("connect", () => {
          if (!disposed) {
            logger.info("Desktop connected")
            setStatus("connected")
          }
        })
        const failed = () => {
          if (!disposed) {
            logger.warn("Desktop disconnected")
            setStatus("error")
            setError("Desktop disconnected. Retry to reconnect.")
          }
        }
        connection.addEventListener("disconnect", failed)
        connection.addEventListener("securityfailure", failed)
        connection.addEventListener("credentialsrequired", failed)
      } catch {
        if (!disposed) {
          logger.error("Desktop client connection failed")
          setStatus("error")
          setError("Could not connect to the desktop. Please retry.")
        }
      }
    }
    void connect()
    return () => {
      disposed = true
      connection?.disconnect()
      client.current = null
      host.remove()
      screen.current = null
    }
  }, [chatId, attempt, paid])

  // Move the existing canvas host; keep its WebSocket and remote session alive.
  const placeScreen = useCallback((target: HTMLDivElement | null) => {
    fullscreenTarget.current = target
    const destination = target ?? preview.current
    if (destination && screen.current) destination.appendChild(screen.current)
    if (client.current) {
      client.current.viewOnly = !target
      if (target) client.current.focus()
    }
  }, [])

  if (!paid)
    return (
      <div className="p-4">
        <Button onClick={showUpgradeToast}>Unlock sandbox desktop</Button>
      </div>
    )

  return (
    <div className="flex flex-col gap-3 p-4">
      <div className="relative aspect-[4/3] overflow-hidden rounded-xl border bg-background">
        <div ref={preview} className="absolute inset-0" />
        <Button
          variant="ghost"
          className="absolute inset-0 size-full rounded-none"
          aria-label={`Open ${name}'s screen fullscreen`}
          disabled={status !== "connected"}
          onClick={() => setFullscreen(true)}
        >
          <span className="sr-only">Open desktop fullscreen</span>
        </Button>
        {status === "connecting" && (
          <p
            role="status"
            className="pointer-events-none absolute inset-0 flex items-center justify-center text-sm text-muted-foreground"
          >
            Connecting desktop…
          </p>
        )}
      </div>
      <p className="text-center text-sm text-muted-foreground">
        {name}&apos;s screen
      </p>
      {status === "error" && (
        <Alert variant="destructive">
          <AlertDescription>
            {error}
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setStatus("connecting")
                setError("")
                setAttempt((value) => value + 1)
              }}
            >
              Retry
            </Button>
          </AlertDescription>
        </Alert>
      )}
      <Dialog
        open={fullscreen}
        disablePointerDismissal
        onOpenChange={(open, details) => {
          if (!open && details.reason !== "close-press") {
            details.cancel()
            return
          }
          setFullscreen(open)
        }}
      >
        <DialogContent className="grid h-dvh w-dvw max-w-none grid-rows-[auto_minmax(0,1fr)] gap-0 rounded-none p-0 sm:max-w-none">
          <DialogHeader className="border-b px-4 py-3 pr-14">
            <DialogTitle>{name}&apos;s screen</DialogTitle>
            <DialogDescription className="sr-only">
              Interactive sandbox desktop. Use the Close button to return to
              chat.
            </DialogDescription>
          </DialogHeader>
          <div ref={placeScreen} className="min-h-0 min-w-0 overflow-hidden" />
        </DialogContent>
      </Dialog>
    </div>
  )
}
