import { eq } from "drizzle-orm"
import { db } from "./database"
import { user } from "./db/schema"
import { createClerkClient } from "@clerk/backend"

import { BILLING_ERROR } from "./billing"

// shortcut: Clerk Billing needs an operator-verified link until the Lago migration.
export async function requirePaidUser(userId: string) {
  const [identity] = await db
    .select({ clerkUserId: user.clerkUserId })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1)
  if (!identity?.clerkUserId) throw new Error(BILLING_ERROR)
  const clerk = createClerkClient({ secretKey: process.env.CLERK_SECRET_KEY })
  const subscription = await clerk.billing.getUserBillingSubscription(
    identity.clerkUserId
  )
  const item = subscription.subscriptionItems.find(
    (item) =>
      item.plan?.slug === "pro" &&
      (item.status === "active" ||
        (item.status === "canceled" &&
          item.periodEnd !== null &&
          item.periodEnd > Date.now()))
  )
  if (!item) throw new Error(BILLING_ERROR)
  return item
}
