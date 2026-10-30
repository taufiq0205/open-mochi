import { schedules } from "@trigger.dev/sdk"
import { cleanupSandboxes } from "../lib/sandbox"

export const sweepSandboxes = schedules.task({
  id: "pause-idle-opensandboxes",
  cron: "* * * * *",
  run: async () => cleanupSandboxes(),
})
