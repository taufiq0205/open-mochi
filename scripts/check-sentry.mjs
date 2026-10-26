import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"

const hooks = {}
const logs = []
const events = []
let flushes = 0
let options
let tags
let attributes
const scope = {
  setTags: (value) => {
    tags = value
  },
  setAttributes: (value) => {
    attributes = value
  },
}
const sentry = {
  init: (value) => {
    options = value
  },
  withIsolationScope: (fn) => fn(scope),
  flush: async () => {
    flushes++
  },
  captureException: (error) => events.push(error),
  logger: Object.fromEntries(
    ["info", "error"].map((level) => [
      level,
      (...args) => logs.push({ level, args }),
    ])
  ),
}
const tasks = Object.fromEntries(
  ["middleware", "onStartAttempt", "onSuccess", "onFailure", "onWait"].map(
    (name) => [
      name,
      (...args) => {
        hooks[name] = args.at(-1)
      },
    ]
  )
)
const code = ts.transpileModule(
  readFileSync(new URL("../trigger/init.ts", import.meta.url), "utf8"),
  {
    compilerOptions: { module: ts.ModuleKind.CommonJS },
  }
).outputText
new Function("require", "exports", code)((name) => {
  if (name === "@sentry/node") return sentry
  if (name === "@trigger.dev/sdk") return { tasks }
  throw new Error(`Unexpected import ${name}`)
}, {})
assert.equal(options.defaultIntegrations, false)
assert.equal(options.enableOpenTelemetrySetup, false)
assert.deepEqual(options.dataCollection.genAI, {
  inputs: false,
  outputs: false,
})
const ctx = {
  task: { id: "test-task" },
  run: { id: "test-run" },
  attempt: { number: 2 },
}
const failure = new Error("test failure")
await hooks.middleware({
  ctx,
  next: async () => {
    hooks.onStartAttempt({ ctx, payload: { secret: "do-not-log" } })
    hooks.onFailure({ ctx, error: failure, payload: { secret: "do-not-log" } })
  },
})
assert.deepEqual(tags, {
  "trigger.task": "test-task",
  "trigger.run": "test-run",
})
assert.deepEqual(attributes, { task_id: "test-task", run_id: "test-run" })
assert.deepEqual(events, [failure])
assert.equal(logs[0].args[1].attempt, 2)
assert.equal(flushes, 1)
await assert.rejects(
  hooks.middleware({
    ctx,
    next: async () => {
      throw failure
    },
  }),
  /test failure/
)
assert.equal(flushes, 2, "flush even when task execution throws")
await hooks.onWait()
assert.equal(flushes, 3, "flush before the worker suspends")
hooks.onSuccess({ ctx, output: { secret: "do-not-log" } })
assert.ok(!JSON.stringify(logs).includes("do-not-log"))
console.log(
  "Sentry checks passed: telemetry ownership, isolated run context, safe lifecycle logs, error capture, and flush on failure/wait (stubbed)."
)
