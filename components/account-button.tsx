"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  ChevronsUpDownIcon,
  LogOutIcon,
  ChartNoAxesCombinedIcon,
  UserRoundIcon,
} from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { useSidebar } from "@/components/ui/sidebar"
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

export function AccountButton() {
  const { data } = authClient.useSession()
  const router = useRouter()
  const { state, isMobile, setOpenMobile } = useSidebar()
  const collapsed = state === "collapsed" && !isMobile
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [open, setOpen] = useState(false)
  return (
    <DropdownMenu
      open={open}
      onOpenChange={(value) => {
        if (!pending) setOpen(value)
      }}
    >
      <DropdownMenuTrigger
        aria-label="Account menu"
        render={
          <Button
            variant="ghost"
            size={collapsed ? "icon" : "default"}
            disabled={pending}
            className={
              collapsed
                ? "shrink-0"
                : "h-12 w-full min-w-0 justify-start gap-2 px-2"
            }
          />
        }
      >
        <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-sidebar-border bg-sidebar-accent text-sidebar-accent-foreground">
          <UserRoundIcon aria-hidden="true" className="size-4" />
        </span>
        {!collapsed && (
          <>
            <span className="min-w-0 flex-1 truncate text-left text-xs">
              {data?.user.name ?? "Account"}
            </span>
            <ChevronsUpDownIcon
              aria-hidden="true"
              className="size-3.5 shrink-0 text-muted-foreground"
            />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side={collapsed ? "right" : "top"}
        align="end"
        className="w-60"
      >
        <DropdownMenuGroup>
          <DropdownMenuLabel className="min-w-0 px-2 py-2">
            <span className="block truncate text-foreground">
              {data?.user.name ?? "Account"}
            </span>
            <span className="mt-1 block truncate font-normal">
              {data?.user.email}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            render={<Link href="/usage" />}
            onClick={() => setOpenMobile(false)}
          >
            <ChartNoAxesCombinedIcon aria-hidden="true" />
            Usage
          </DropdownMenuItem>
          <DropdownMenuItem
            aria-label="Sign out"
            disabled={pending}
            closeOnClick={false}
            onClick={async () => {
              if (pending) return
              setPending(true)
              setError("")
              try {
                const result = await authClient.signOut()
                if (result.error) setError("Could not sign out. Please retry.")
                else {
                  router.replace("/sign-in")
                  router.refresh()
                }
              } catch {
                setError("Could not sign out. Please retry.")
              } finally {
                setPending(false)
              }
            }}
          >
            <LogOutIcon aria-hidden="true" />
            {pending ? "Signing out…" : "Sign out"}
          </DropdownMenuItem>
        </DropdownMenuGroup>
        {error && (
          <p role="alert" className="px-2 py-2 text-xs text-destructive">
            {error}
          </p>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
