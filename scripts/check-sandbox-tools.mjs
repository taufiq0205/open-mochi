import assert from "node:assert/strict"
import { convertToModelMessages } from "ai"
import { createSandboxTools } from "../lib/sandbox-tools.ts"

const calls = []
let size = 10
let failure = false
let closed = 0
const sandbox = {
  close: async () => {
    closed++
  },
  commands: {
    run: async (command, options) => {
      calls.push(["command", command, options])
      if (failure) throw new Error("secret provider response")
      if (Array.isArray(command))
        return { exitCode: 0, logs: { stdout: [], stderr: [] } }
      return {
        exitCode: 2,
        logs: {
          stdout: [{ text: "x".repeat(20001) }],
          stderr: [{ text: "err" }],
        },
      }
    },
  },
  files: {
    withIdentity(uid, gid) {
      assert.equal(uid, 1000)
      assert.equal(gid, 1000)
      return this
    },
    getFileInfo: async ([path]) => ({ [path]: { size } }),
    readFile: async (...args) => {
      calls.push(["read", ...args])
      return "hello"
    },
    writeFiles: async (...args) => {
      calls.push(["write", ...args])
    },
    listDirectory: async () =>
      Array.from({ length: 201 }, (_, i) => ({ path: String(i) })),
    readBytes: async () => Buffer.from("screen"),
    deleteFiles: async () => {},
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
assert.equal(bash.exitCode, 2)
assert.equal(bash.output.length, 20000)
assert.equal(bash.truncated, true)
assert.deepEqual(calls, [
  [
    "command",
    "false",
    { workingDirectory: "/tmp", timeoutSeconds: 60, uid: 1000, gid: 1000 },
  ],
])
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
assert.deepEqual(calls.at(-1), ["write", [{ path: "/tmp/test", data: "hi" }]])
const listing = await tools.listFiles.execute({ path: "/tmp" }, options)
assert.equal(listing.files.length, 200)
assert.equal(listing.truncated, true)
await Promise.all([
  tools.mouseClick.execute(
    { x: 0, y: 0, button: "right", double: true },
    options
  ),
  tools.mouseMove.execute({ x: 3, y: 4 }, options),
  tools.mouseScroll.execute(
    { x: 5, y: 6, direction: "left", amount: 3 },
    options
  ),
  tools.keyboardType.execute({ text: "hello '$x'" }, options),
  tools.keyboardPress.execute({ key: "enter", modifiers: ["ctrl"] }, options),
])
assert.deepEqual(
  calls.slice(-5).map((call) => call[1]),
  [
    ["xdotool", "mousemove", "--sync", "0", "0", "click", "--repeat", "2", "3"],
    ["xdotool", "mousemove", "--sync", "3", "4"],
    ["xdotool", "mousemove", "--sync", "5", "6", "click", "--repeat", "3", "6"],
    ["xdotool", "type", "--clearmodifiers", "--", "hello '$x'"],
    ["xdotool", "key", "--clearmodifiers", "--", "ctrl+Return"],
  ]
)
assert.equal(resolutions, 10)
assert.equal(closed, resolutions)
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
console.log(
  "Sandbox checks passed: lazy startup, serial actions, all ten tools, limits, validation, cancellation, sanitized errors, and screenshot history conversion (stubbed)."
)

size = 10
assert.deepEqual(await tools.readMemory.execute({}, options), {
  content: "hello",
})
assert.deepEqual(calls.at(-1), [
  "read",
  "/home/desktop/MEMORY.md",
  { limit: 20000 },
])
assert.deepEqual(
  await tools.writeMemory.execute({ content: "Remember tea" }, options),
  { written: true }
)
assert.deepEqual(calls.at(-1), [
  "write",
  [{ path: "/home/desktop/MEMORY.md", data: "Remember tea", mode: 600 }],
])
assert.equal(
  tools.writeMemory.inputSchema.safeParse({ content: "x".repeat(5001) })
    .success,
  false
)
console.log("Memory tools read and write only MEMORY.md (stubbed).")

size = 20001
const beforeMemory = calls.length
await assert.rejects(
  tools.readMemory.execute({}, options),
  /Sandbox operation failed/
)
assert.equal(calls.length, beforeMemory)
assert.equal(closed, resolutions)
console.log(
  "OpenSandbox tools passed: nonzero exits, filesystem identity, coordinate zero, argv-safe input, horizontal scroll, limits and handle cleanup."
)
