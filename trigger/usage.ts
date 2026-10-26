import { logger } from "@sentry/core"
import { schemaTask, schedules } from "@trigger.dev/sdk"
import { z } from "zod"
import { db } from "../lib/database"
import { closeSandboxLease } from "../lib/metered-sandbox"

export const stopSandboxLease = schemaTask({
  id: "stop-sandbox-lease",
  schema: z.object({ id: z.string().uuid() }),
  retry: {
    maxAttempts: 10,
    minTimeoutInMs: 1000,
    maxTimeoutInMs: 30_000,
    factor: 2,
  },
  run: async ({ id }) => closeSandboxLease(id),
})

export const sweepSandboxLeases = schedules.task({
  id: "sweep-sandbox-leases",
  cron: "* * * * *",
  run: async () => {
    const { rows } = await db.$client.query<{ id: string }>(
      "SELECT id FROM usage_ledger WHERE meter='sandbox' AND closed_at IS NULL AND expires_at <= now() ORDER BY expires_at LIMIT 100"
    )
    const results = await Promise.allSettled(
      rows.map(({ id }) => closeSandboxLease(id))
    )
    if (rows.length)
      logger.info("Sandbox lease sweep completed", {
        lease_count: rows.length,
        failed_count: results.filter((result) => result.status === "rejected")
          .length,
      })
    if (results.some((result) => result.status === "rejected"))
      throw new Error("Sandbox lease cleanup incomplete; retry required")
  },
})
