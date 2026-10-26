import "server-only"
import { cache } from "react"
import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { auth } from "./auth"
import { BILLING_ERROR } from "./billing"
import { requirePaidUser } from "./paid-plan"

export const getSession = cache(async () =>
  auth.api.getSession({ headers: await headers() })
)

export const requireSession = cache(async () => {
  const session = await getSession()
  if (!session) redirect("/sign-in")
  return { userId: session.user.id }
})

export const getAccess = cache(async () => {
  const identity = await requireSession()
  try {
    await requirePaidUser(identity.userId)
    return { ...identity, paid: true }
  } catch (error) {
    if (!(error instanceof Error) || error.message !== BILLING_ERROR)
      throw error
    return { ...identity, paid: false }
  }
})
