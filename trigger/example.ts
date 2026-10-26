import { logger } from "@sentry/core"
import { task, wait } from "@trigger.dev/sdk"

export const helloWorldTask = task({
  id: "hello-world",
  // Set an optional maxDuration to prevent tasks from running indefinitely
  maxDuration: 300, // Stop executing after 300 secs (5 mins) of compute
  run: async () => {
    logger.info("Example task running")

    await wait.for({ seconds: 5 })

    return {
      message: "Hello, world!",
    }
  },
})
