"use client"

import { createAuthClient } from "better-auth/react"
import { useEffect, useState } from "react"

export const authClient = createAuthClient()

// Client gates are advisory; every server action rechecks identity and billing.
export function useEntitlement() {
  const { data, isPending } = authClient.useSession()
  const userId = data?.user.id
  const [entitlement, setEntitlement] = useState<{
    userId: string
    paid: boolean
  } | null>(null)
  useEffect(() => {
    if (!userId) return
    const controller = new AbortController()
    fetch("/api/entitlement", { cache: "no-store", signal: controller.signal })
      .then(async (response) => ({
        paid: response.ok && (await response.json()).paid === true,
      }))
      .then(({ paid }) => setEntitlement({ userId, paid }))
      .catch(() => {
        if (!controller.signal.aborted) setEntitlement({ userId, paid: false })
      })
    return () => controller.abort()
  }, [userId])
  return {
    isLoaded: !isPending && (!userId || entitlement?.userId === userId),
    paid: !!userId && entitlement?.userId === userId && entitlement.paid,
  }
}
