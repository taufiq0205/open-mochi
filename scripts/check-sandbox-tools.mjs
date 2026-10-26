import assert from "node:assert/strict"
import { convertToModelMessages } from "ai"
import { createSandboxTools } from "../lib/sandbox-tools.ts"

const calls = []
let size = 10
let failure = false
const sandbox = {
  state: "stopped",
  start: async () => {
    calls.push(["start"])
    sandbox.state = "started"
  },
  process: {
    executeCommand: async (...args) => {
      calls.push(["bash", ...args])
      if (failure) throw new Error("secret API response")
      return { exitCode: 1, result: "x".repeat(20001) }
    },
  },
  fs: {
    getFileDetails: async () => ({ size }),
    downloadFile: async (...args) => {
      calls.push(["read", ...args])
      return Buffer.from("hello")
    },
    uploadFile: async (...args) => {
      calls.push(["write", ...args])
    },
    listFiles: async () =>
      Array.from({ length: 201 }, (_, i) => ({ name: String(i) })),
  },
  computerUse: {
    start: async () => {
      calls.push(["desktop"])
    },
    mouse: {
      click: async (...args) => {
        calls.push(["click", ...args])
        return { success: true }
      },
      move: async (...args) => {
        calls.push(["move", ...args])
        return { x: args[0], y: args[1] }
      },
      scroll: async (...args) => {
        calls.push(["scroll", ...args])
        return true
      },
    },
    keyboard: {
      type: async (...args) => {
        calls.push(["type", ...args])
      },
      press: async (...args) => {
        calls.push(["press", ...args])
      },
    },
    screenshot: { takeFullScreen: async () => ({ screenshot: "c2NyZWVu" }) },
  },
}
let resolutions = 0
const tools = createSandboxTools(async () => {
  resolutions++
  return sandbox
})
const options = { toolCallId: "call_1", messages: [] }
assert.equal(calls.length, 0)
const bash = await tools.bash.execute(
  { command: "false", cwd: "/tmp" },
  options
)
assert.equal(bash.exitCode, 1)
assert.equal(bash.output.length, 20000)
assert.equal(bash.truncated, true)
assert.deepEqual(calls, [["start"], ["bash", "false", "/tmp", undefined, 60]])
assert.deepEqual(await tools.readFile.execute({ path: "/tmp/test" }, options), {
  content: "hello",
  truncated: false,
})
size = 1000001
const beforeLarge = calls.length
await assert.rejects(
  tools.readFile.execute({ path: "/tmp/large" }, options),
  /Sandbox operation failed/
)
assert.equal(calls.length, beforeLarge)
await tools.writeFile.execute({ path: "/tmp/test", content: "hi" }, options)
assert.deepEqual(calls.at(-1), ["write", Buffer.from("hi"), "/tmp/test", 60])
const listing = await tools.listFiles.execute({ path: "/tmp" }, options)
assert.equal(listing.files.length, 200)
assert.equal(listing.truncated, true)
await Promise.all([
  tools.mouseClick.execute(
    { x: 1, y: 2, button: "left", double: false },
    options
  ),
  tools.mouseMove.execute({ x: 3, y: 4 }, options),
  tools.mouseScroll.execute(
    { x: 5, y: 6, direction: "down", amount: 3 },
    options
  ),
  tools.keyboardType.execute({ text: "hello" }, options),
  tools.keyboardPress.execute({ key: "enter", modifiers: ["ctrl"] }, options),
])
assert.deepEqual(calls.slice(-6), [
  ["desktop"],
  ["click", 1, 2, "left", false],
  ["move", 3, 4],
  ["scroll", 5, 6, "down", 3],
  ["type", "hello"],
  ["press", "enter", ["ctrl"]],
])
assert.equal(
  resolutions,
  10,
  "Reauthorize the sandbox lease before each operation"
)
assert.equal(calls.filter(([name]) => name === "desktop").length, 1)
const output = await tools.viewScreen.execute({}, options)
assert.equal(output.showInChat, false)
const shared = await tools.viewScreen.execute({ showInChat: true }, options)
assert.equal(shared.showInChat, true)
assert.equal(shared.screenshot, output.screenshot)
assert.equal(tools.viewScreen.inputSchema.parse({}).showInChat, false)
assert.equal(
  tools.viewScreen.inputSchema.safeParse({ showInChat: "yes" }).success,
  false
)
const modelOutput = await tools.viewScreen.toModelOutput({
  output,
  input: {},
  toolCallId: "screen_1",
})
assert.deepEqual(modelOutput.value[1], {
  type: "file",
  mediaType: "image/png",
  data: { type: "data", data: "c2NyZWVu" },
})
const history = await convertToModelMessages(
  [
    {
      id: "1",
      role: "assistant",
      parts: [
        {
          type: "tool-viewScreen",
          toolCallId: "screen_1",
          state: "output-available",
          input: {},
          output,
        },
      ],
    },
  ],
  { tools }
)
assert.ok(JSON.stringify(history).includes('"mediaType":"image/png"'))
const controller = new AbortController()
controller.abort()
const beforeAbort = calls.length
await assert.rejects(
  tools.bash.execute(
    { command: "echo bad" },
    { ...options, abortSignal: controller.signal }
  ),
  /Sandbox operation failed/
)
assert.equal(calls.length, beforeAbort)
failure = true
await assert.rejects(
  tools.bash.execute({ command: "fail" }, options),
  /Sandbox operation failed/
)
failure = false
await tools.bash.execute({ command: "retry" }, options)
for (const [name, input] of [
  ["bash", { command: "" }],
  ["mouseMove", { x: -1, y: 0 }],
  ["mouseScroll", { x: 0, y: 0, direction: "bad" }],
  ["keyboardPress", { key: "enter", modifiers: ["invalid"] }],
]) {
  assert.equal(tools[name].inputSchema.safeParse(input).success, false)
}
for (const state of ["archived", "paused", "starting", "error"]) {
  const lifecycle = []
  const other = createSandboxTools(async () => ({
    ...sandbox,
    state,
    start: async () => lifecycle.push("start"),
    waitUntilStarted: async () => lifecycle.push("wait"),
  }))
  if (state === "error")
    await assert.rejects(other.listFiles.execute({ path: "/" }, options))
  else {
    await other.listFiles.execute({ path: "/" }, options)
    assert.deepEqual(lifecycle, [state === "starting" ? "wait" : "start"])
  }
}
console.log(
  "Sandbox checks passed: lazy startup, serial actions, all ten tools, limits, validation, cancellation, sanitized errors, and screenshot history conversion (stubbed)."
)

size = 10
assert.deepEqual(await tools.readMemory.execute({}, options), {
  content: "hello",
})
assert.deepEqual(calls.at(-1), ["read", "MEMORY.md", 60])
assert.deepEqual(
  await tools.writeMemory.execute({ content: "Remember tea" }, options),
  { written: true }
)
assert.equal(calls.at(-1)[2], "MEMORY.md")
assert.equal(calls.at(-1)[1].toString(), "Remember tea")
assert.equal(
  tools.writeMemory.inputSchema.safeParse({ content: "x".repeat(5001) })
    .success,
  false
)
console.log("Memory tools read and write only MEMORY.md (stubbed).")
