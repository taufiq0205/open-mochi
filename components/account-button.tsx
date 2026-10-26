"use client"

import Link from "next/link"
import { useRouter } from "next/navigation"
import { useState } from "react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"

export function AccountButton() {
  const { data } = authClient.useSession()
  const router = useRouter()
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  return (
    <div className="flex min-w-0 flex-col gap-2 p-2">
      <span className="truncate text-sm">{data?.user.name}</span>
      <Link href="/usage" className="text-sm underline">
        Usage
      </Link>
      <Button
        variant="ghost"
        size="sm"
        disabled={pending}
        onClick={async () => {
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
        Sign out
      </Button>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}
