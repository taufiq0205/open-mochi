import { requireSession } from "@/lib/session"

export default async function PricingPage() {
  await requireSession()

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Choose your plan</h1>
        <p className="text-muted-foreground">
          Pro includes $5 of AI token allowance, $5 of sandbox resource
          allocations, up to 3 stored bots, and 1 active sandbox per
          subscription period. The free plan does not include access to bots or
          sandboxes.
        </p>
      </div>
      <p>
        Subscription checkout will be available after the Lago migration.
        Existing subscriptions require an operator-verified account link.
      </p>
    </main>
  )
}
