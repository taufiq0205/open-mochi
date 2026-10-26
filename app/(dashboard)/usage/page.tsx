import Link from "next/link"
import { auth } from "@clerk/nextjs/server"
import { BILLING_ERROR } from "@/lib/billing"
import { getUsagePeriod, getUsageSummary } from "@/lib/usage"
import { BOT_LIMIT, USAGE_LIMIT } from "@/lib/usage-policy"
import { UsageReset } from "@/components/usage-reset"
import { Progress, ProgressLabel } from "@/components/ui/progress"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card"

export default async function UsagePage() {
  const { userId } = await auth.protect()
  let period
  try {
    period = await getUsagePeriod(userId)
  } catch (error) {
    if (!(error instanceof Error && error.message === BILLING_ERROR))
      throw error
    return (
      <main className="mx-auto flex max-w-3xl flex-col gap-4 p-6">
        <h1 className="text-2xl font-semibold">Usage</h1>
        <p>Free accounts have no bot, AI, or sandbox allowance.</p>
        <Link href="/pricing" className="underline">
          View plans
        </Link>
      </main>
    )
  }
  const usage = await getUsageSummary(period)
  const dollars = (micros: number) =>
    new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
      minimumFractionDigits: 2,
      maximumFractionDigits: 3,
    }).format(micros / 1_000_000)
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold">Usage</h1>
        <p className="text-muted-foreground">
          Your Pro allowance for the current subscription period. No automatic
          overage charges.
        </p>
        <UsageReset resetsAt={period.end.toISOString()} />
      </div>
      <Card>
        <CardHeader>
          <CardTitle>AI tokens</CardTitle>
          <CardDescription>
            Conservative cost at peak, uncached rates. Unused reservations are
            released when the provider confirms token usage.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Progress value={usage.ai} max={USAGE_LIMIT}>
            <ProgressLabel>
              {dollars(usage.ai)} / {dollars(USAGE_LIMIT)}
            </ProgressLabel>
          </Progress>
          <p className="text-sm text-muted-foreground">
            {Number(usage.input).toLocaleString()} input tokens ·{" "}
            {Number(usage.output).toLocaleString()} output tokens ·{" "}
            {dollars(usage.reserved)} reserved
          </p>
          <p className="text-sm text-muted-foreground">
            Interrupted or unconfirmed requests retain their reservation. A
            request needs enough remaining allowance for its maximum possible
            cost.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Sandbox resources</CardTitle>
          <CardDescription>
            Allocated compute and storage, including bot creation. Up to one
            active sandbox session at a time.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Progress value={usage.sandbox} max={USAGE_LIMIT}>
            <ProgressLabel>
              {dollars(usage.sandbox)} / {dollars(USAGE_LIMIT)}
            </ProgressLabel>
          </Progress>
          <p className="text-sm text-muted-foreground">
            Sessions last up to 5 minutes. Each allocation covers up to 6
            minutes of compute and 24 hours of storage, including a cutoff
            safety buffer. Unused sandbox allocations are not refunded.
          </p>
          <p className="text-sm text-muted-foreground">
            Stopped sandbox files expire after 24 hours without use. If the
            scheduled stop fails, the sandbox and its files are destroyed at the
            hard cutoff. Recreate an expired bot to continue.
          </p>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Stored bots</CardTitle>
          <CardDescription>
            Delete a bot to free a slot. This limit does not reset monthly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Progress value={usage.bots} max={BOT_LIMIT}>
            <ProgressLabel>
              {usage.bots} / {BOT_LIMIT} bots
            </ProgressLabel>
          </Progress>
        </CardContent>
      </Card>
      <Link href="/pricing" className="text-sm underline">
        Manage plan
      </Link>
    </main>
  )
}
