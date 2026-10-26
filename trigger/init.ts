import * as Sentry from "@sentry/node"
import { tasks } from "@trigger.dev/sdk"

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  defaultIntegrations: false,
  // Trigger.dev owns OpenTelemetry; Sentry captures errors and logs only here.
  enableOpenTelemetrySetup: false,
  environment:
    process.env.NODE_ENV === "production" ? "production" : "development",
  dataCollection: {
    userInfo: false,
    cookies: false,
    httpHeaders: false,
    httpBodies: [],
    urlQueryParams: false,
    genAI: { inputs: false, outputs: false },
    databaseQueryData: false,
  },
})

tasks.middleware("sentry", async ({ ctx, next }) => {
  await Sentry.withIsolationScope(async (scope) => {
    scope.setTags({ "trigger.task": ctx.task.id, "trigger.run": ctx.run.id })
    scope.setAttributes({ task_id: ctx.task.id, run_id: ctx.run.id })
    try {
      await next()
    } finally {
      await Sentry.flush(2000)
    }
  })
})

tasks.onStartAttempt(({ ctx }) => {
  Sentry.logger.info("Task attempt started", {
    task_id: ctx.task.id,
    run_id: ctx.run.id,
    attempt: ctx.attempt.number,
  })
})

tasks.onSuccess(({ ctx }) => {
  Sentry.logger.info("Task completed", {
    task_id: ctx.task.id,
    run_id: ctx.run.id,
  })
})

tasks.onFailure(({ error, ctx }) => {
  Sentry.logger.error("Task failed", {
    task_id: ctx.task.id,
    run_id: ctx.run.id,
  })
  Sentry.captureException(error)
})

tasks.onWait(async () => {
  await Sentry.flush(2000)
})
