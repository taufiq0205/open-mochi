import * as sentryCore from "@sentry/core"
import * as sentryNode from "@sentry/node"
import { mockChatAgent } from "@trigger.dev/sdk/ai/test"
import { chat as managedChat } from "@trigger.dev/sdk/ai"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import { configure } from "@trigger.dev/sdk"
import { apiClientManager } from "@trigger.dev/core/v3"
import { z } from "zod"
import { Collapsible as CollapsiblePrimitive } from "@base-ui/react/collapsible"
import * as React from "react"
import * as jsxRuntime from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"
import { isToolUIPart, getToolName } from "ai"
import { stepCountIs, tool, streamText as sdkStreamText } from "ai"
import { MockLanguageModelV4, simulateReadableStream } from "ai/test"
import { createSandboxTools } from "../lib/sandbox-tools.ts"

function load(path, dependencies) {
  const compiled = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }
  ).outputText
  const exports = {}
  new Function("require", "exports", compiled)((name) => {
    if (name === "@sentry/core") return sentryCore
    if (name === "@sentry/node") return dependencies[name] ?? sentryNode
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, exports)
  return exports
}

let authenticated = true
let owned = true
let failure = false
const calls = []
const previousVercelBranch = process.env.VERCEL_GIT_COMMIT_REF
process.env.VERCEL_GIT_COMMIT_REF = "main"
const actions = load("../actions/chat.ts", {
  zod: { z },

  "@/lib/session": {
    requireSession: async () => {
      if (!authenticated) throw new Error("Unauthorized")
      return { userId: "user_1" }
    },
  },
  "@/queries/chats": {
    getChat: async () => {
      if (failure) throw new Error("Database unavailable")
      return owned ? { id: "chat_1" } : undefined
    },
  },
  "@trigger.dev/sdk": {
    configure,
    auth: {
      createPublicToken: async (options) => {
        calls.push(options)
        return "token"
      },
    },
  },
  "@trigger.dev/sdk/ai": {
    defaultStorage: {},
    chat: {
      createStartSessionAction: (task) => async (params) => {
        calls.push({ task, ...params })
        return {}
      },
      createLoadTranscriptAction: () => async (params) => {
        calls.push(params)
        return { messages: [] }
      },
    },
  },
})
assert.equal(
  apiClientManager.branchName,
  undefined,
  "Vercel main must not select a Trigger preview branch"
)
assert.equal(
  apiClientManager.baseURL,
  process.env.TRIGGER_API_URL ?? "http://localhost:8030"
)
if (previousVercelBranch === undefined) delete process.env.VERCEL_GIT_COMMIT_REF
else process.env.VERCEL_GIT_COMMIT_REF = previousVercelBranch

for (const action of [
  () =>
    actions.startChatSession({
      chatId: "chat_1",
      clientData: { userId: "spoof" },
    }),
  () => actions.mintChatAccessToken("chat_1"),
  () => actions.loadChatTranscript({ chatId: "chat_1" }),
]) {
  authenticated = false
  await assert.rejects(action(), /Unauthorized/)
  authenticated = true
  owned = false
  await assert.rejects(action(), /Chat not found/)
  owned = true
  failure = true
  await assert.rejects(action(), /Database unavailable/)
  failure = false
  assert.equal(calls.length, 0)
}
await assert.rejects(actions.startChatSession({ chatId: "" }))
await actions.startChatSession({
  chatId: "chat_1",
  clientData: { instructions: "spoof" },
})
await actions.mintChatAccessToken("chat_2")
await actions.loadChatTranscript({ chatId: "chat_2" })
assert.deepEqual(calls, [
  { task: "chat-agent", chatId: "chat_1" },
  {
    scopes: { read: { sessions: "chat_2" }, write: { sessions: "chat_2" } },
    expirationTime: "1h",
  },
  { chatId: "chat_2" },
])

let rows = [
  {
    kind: "direct",
    name: "Ada",
    job: "Research assistant",
    instructions: "Be concise.",
    sandboxId: "sandbox_1",
  },
]
let queryFailure = false
const queries = []
const sandboxIds = []
const memoryContents = new Map()
const responseParts = []
let writeResponse = (part) => responseParts.push(part)
let uiHistory = []
let readHistory = () => uiHistory
let roster = []
const turnExceptions = []
const { chatAgent } = load("../trigger/chat.ts", {
  "@sentry/node": {
    captureException: (error) => turnExceptions.push(error),
    flush: async () => true,
  },

  zod: { z },
  ai: { stepCountIs, tool },
  "../lib/sandbox-tools": { createSandboxTools },

  "../lib/sandbox": {
    openSandbox: async (userId, id) => {
      assert.equal(userId, "user_1")
      sandboxIds.push(id)
      return {
        close: async () => {},
        files: {
          withIdentity() {
            return this
          },
          listDirectory: async () => [],
          getFileInfo: async ([path]) => ({ [path]: { size: 12 } }),
          readFile: async (path) => {
            assert.equal(path, "/home/desktop/MEMORY.md")
            return memoryContents.get(id) ?? `Memory of ${id}`
          },
          uploadFile: async (_, path) =>
            assert.equal(path, "/home/desktop/MEMORY.md"),
        },
      }
    },
  },
  "@ai-sdk/deepseek": { deepSeek: (model) => model },
  "@trigger.dev/sdk/ai": {
    chat: {
      response: { write: (part) => writeResponse(part) },
      history: { all: () => readHistory() },
      withClientData: ({ schema }) => ({
        agent: (config) => ({ ...config, clientDataSchema: schema }),
      }),
    },
  },
  pg: {
    Pool: class {
      on() {}
      async query(sql, values) {
        if (sql.includes('c.user_id AS "userId"'))
          assert.match(sql, /JOIN auth_user u ON u.id = c.user_id/)
        queries.push({ sql, values })
        if (queryFailure) throw new Error("Database unavailable")
        return {
          rows: (sql.includes("FROM chats c JOIN chat_members")
            ? roster
            : rows
          ).map((row) => ({ userId: "user_1", ...row })),
        }
      }
    },
  },
})
const messages = [
  { id: "1", role: "user", parts: [{ type: "text", text: "Hello" }] },
]
uiHistory = messages
const unexpectedTurnError = new Error("Unexpected provider failure")
await chatAgent.onTurnComplete({
  chatId: "chat_1",
  error: unexpectedTurnError,
  stopped: false,
})
assert.deepEqual(turnExceptions, [unexpectedTurnError])
await chatAgent.onTurnComplete({
  chatId: "chat_1",
  error: new Error("Cancelled"),
  stopped: true,
})
assert.equal(
  turnExceptions.length,
  1,
  "stopped turns are not captured as exceptions"
)
assert.deepEqual(await chatAgent.onValidateMessages({ messages }), messages)
const taggedMessages = [
  {
    id: "tagged_prompt",
    role: "user",
    parts: [
      { type: "data-target-bot", data: "bot_1" },
      { type: "text", text: "Hi Ada" },
    ],
  },
]
assert.deepEqual(
  await chatAgent.onValidateMessages({ messages: taggedMessages }),
  taggedMessages
)
for (const data of ["", "a".repeat(101), 12, null]) {
  await assert.rejects(
    chatAgent.onValidateMessages({
      messages: [
        {
          ...taggedMessages[0],
          parts: [{ type: "data-target-bot", data }, messages[0].parts[0]],
        },
      ],
    })
  )
}
for (const invalid of [
  [],
  [{ ...messages[0], role: "system" }],
  [{ ...messages[0], parts: [{ type: "file" }] }],
  [{ ...messages[0], parts: [{ type: "data-target-bot", data: "bot_1" }] }],
]) {
  await assert.rejects(chatAgent.onValidateMessages({ messages: invalid }))
}
const oldDatabase = process.env.DATABASE_URL
const oldKey = process.env.DEEPSEEK_API_KEY
try {
  process.env.DATABASE_URL = "stub"
  process.env.DEEPSEEK_API_KEY = "stub"
  const signal = new AbortController().signal
  const resolvedTools = chatAgent.tools({ chatId: "chat_1" })
  const run = () =>
    chatAgent.run({
      chatId: "chat_1",
      messages,
      signal,
      tools: resolvedTools,
      streamText: (options) => options,
    })
  const result = await run()
  assert.match(result.instructions, /"name":"Ada","job":"Research assistant"/)
  assert.match(result.instructions, /Your purpose is to help the user/)
  assert.match(result.instructions, /isolated Linux machine in the cloud/)
  assert.match(
    result.instructions,
    /filesystem, network, CPU, memory, and disk/
  )
  assert.doesNotMatch(result.instructions, /Daytona/i)
  assert.match(result.instructions, /This chat runs separately/)
  assert.match(
    result.instructions,
    /Additional bot instructions:\nBe concise\./
  )
  assert.match(result.instructions, /sandbox tools/)
  assert.match(result.instructions, /showInChat: true/)
  const { handoff, ...sandboxTools } = resolvedTools
  assert.equal(handoff.inputSchema.safeParse({ botId: "" }).success, false)
  assert.deepEqual(result.tools, sandboxTools)
  assert.equal(result.tools.handoff, undefined)
  assert.ok(result.tools.viewScreen.toModelOutput)
  assert.equal(typeof result.stopWhen, "function")
  assert.equal(result.model, "deepseek-flash")
  assert.equal(result.abortSignal, signal)
  assert.deepEqual(result.messages, messages)
  assert.deepEqual(queries[0].values, ["chat_1", null])
  rows = [{ kind: "direct", instructions: null }]
  const fallback = await run()
  assert.match(
    fallback.instructions,
    /"name":"Assistant","job":"General assistant"/
  )
  assert.match(fallback.instructions, /No sandbox is associated/)
  assert.doesNotMatch(fallback.instructions, /Additional bot instructions/)
  rows = [
    {
      kind: "direct",
      name: "Grace",
      job: "Writer",
      instructions: "",
      sandboxId: null,
    },
  ]
  assert.match((await run()).instructions, /"name":"Grace","job":"Writer"/)
  assert.match(queries[0].sql, /b\.user_id = c\.user_id/)
  assert.match(queries[0].sql, /b\.sandbox_id AS "sandboxId"/)
  rows = [{ sandboxId: "owned_sandbox" }]
  const toolOptions = { toolCallId: "call_1", messages: [] }
  await resolvedTools.listFiles.execute({ path: "/tmp" }, toolOptions)
  assert.deepEqual(sandboxIds, ["owned_sandbox"])
  assert.match(queries.at(-1).sql, /b\.user_id = c\.user_id/)
  assert.deepEqual(queries.at(-1).values, ["chat_1"])
  for (const [id, name] of [
    ["bot_1", "Ada"],
    ["bot_2", "Grace"],
  ]) {
    rows = [
      {
        kind: "group",
        id,
        avatar: id,
        name,
        job: "Writer",
        sandboxId: "ignored_sandbox",
      },
    ]
    roster = [
      rows[0],
      {
        id: "target",
        kind: "group",
        name: "Tutor",
        job: "Teaching",
        instructions: "Teach with examples.",
        avatar: "tutor-avatar",
        sandboxId: "tutor_sandbox",
      },
    ]
    uiHistory = [
      {
        id: "old-reply",
        role: "assistant",
        parts: [
          { type: "data-bot-identity", data: "target" },
          { type: "text", text: "I am Tutor. I used my handoff earlier." },
          {
            type: "tool-handoff",
            toolCallId: "stale-handoff",
            state: "output-error",
            input: { botId: id },
            errorText: "Old turn already handed off",
          },
        ],
      },
      {
        id: "legacy-reply",
        role: "assistant",
        parts: [
          { type: "data-bot-avatar", data: id },
          { type: "text", text: "An older reply without a stored bot ID." },
        ],
      },
      messages[0],
    ]
    const group = await chatAgent.run({
      chatId: "group_1",
      clientData: { botId: id },
      messages,
      tools: resolvedTools,
      signal,
      streamText: (options) => options,
    })
    assert.deepEqual(Object.keys(group.tools), [
      "readMemory",
      "writeMemory",
      "handoff",
    ])
    assert.equal(
      group.tools.handoff.inputSchema.safeParse({ botId: id }).success,
      false
    )
    assert.equal(
      group.tools.handoff.inputSchema.safeParse({ botId: "target", reason: "checking notes" }).success,
      true
    )
    assert.deepEqual(responseParts.at(-1), {
      type: "data-bot-avatar",
      id: "bot-avatar",
      data: id,
    })
    assert.match(group.instructions, new RegExp(name))
    assert.match(group.instructions, /Memory: Your sandbox/)
    assert.deepEqual(queries.at(-2).values, ["group_1", id])
    assert.match(queries.at(-2).sql, /c.kind = 'direct' OR b.id = \$2/)
    assert.match(queries.at(-1).sql, /b.user_id = c.user_id/)
    assert.match(queries.at(-1).sql, /c.kind = 'group'/)
    assert.match(group.instructions, /Group members/)
    assert.match(group.instructions, /Teaching/)
    assert.match(group.instructions, /fresh user turn/)
    assert.match(group.instructions, /prior context.*call handoff/)
    assert.match(group.instructions, /authoritative/)
    assert.equal(group.messages[0].role, "user")
    assert.match(group.messages[0].content, /"name":"Tutor"/)
    assert.match(group.messages[1].content, new RegExp(`"name":"${name}"`))
    assert.doesNotMatch(
      JSON.stringify(group.messages),
      /stale-handoff|Old turn already handed off/
    )
    assert.equal(group.messages.at(-1).content, "Hello")
    assert.deepEqual(group.prepareStep().activeTools, [
      "readMemory",
      "writeMemory",
      "handoff",
    ])
    assert.deepEqual(
      await group.tools.readMemory.execute(
        {},
        { toolCallId: "memory", messages: [] }
      ),
      { content: "Memory of ignored_sandbox" }
    )
    assert.equal(sandboxIds.pop(), "ignored_sandbox")
    const openedAfterRead = sandboxIds.length
    await group.tools.readMemory.execute(
      {},
      { toolCallId: "repeat", messages: [] }
    )
    assert.equal(
      sandboxIds.length,
      openedAfterRead,
      "Repeated reads reuse this bot's turn memory"
    )
    assert.ok(
      !group.prepareStep().activeTools.includes("readMemory"),
      "Hide memory reads after the first call"
    )
    const execute = group.tools.handoff.execute
    assert.match((await execute({ botId: "outsider" })).error, /not a member/)
    assert.match(
      (await execute({ botId: id })).error,
      new RegExp(`already ${name}`)
    )
    assert.deepEqual(
      await execute({ botId: "target", reason: "checking notes" }),
      {
        botId: "target",
        name: "Tutor",
        fromAvatar: id,
        reason: "checking notes",
      }
    )
    assert.deepEqual(
      await group.tools.readMemory.execute(
        {},
        { toolCallId: "memory", messages: [] }
      ),
      { content: "Memory of tutor_sandbox" }
    )
    assert.equal(sandboxIds.pop(), "tutor_sandbox")
    const next = group.prepareStep()
    assert.match(next.instructions, /"name":"Tutor","job":"Teaching"/)
    assert.match(next.instructions, /Teach with examples/)
    assert.match(next.instructions, /This turn was handed to you/)
    assert.match(next.instructions, /handoff to Tutor has already succeeded/)
    assert.match(next.instructions, /as fulfilled, not as a new request/)
    assert.match(next.instructions, /do not repeat takeover introductions/)
    assert.doesNotMatch(
      next.instructions,
      /If the requested bot ID is your own ID, say you are already/
    )
    assert.deepEqual(next.activeTools, ["writeMemory"])
    assert.deepEqual(next.messages, group.messages)
    assert.deepEqual(group.prepareStep().messages, group.messages)
    assert.deepEqual(responseParts.at(-1), {
      type: "data-bot-avatar",
      id: "bot-avatar",
      data: "tutor-avatar",
    })
    assert.match((await execute({ botId: id })).error, /already consulted/)
  }

  const savedRoster = roster
  roster = [
    rows[0],
    ...["second", "third"].map((id) => ({
      kind: "group",
      id,
      name: id,
      avatar: id,
      job: "Assistant",
      sandboxId: id,
    })),
  ]
  for (const member of roster) memoryContents.set(member.sandboxId, "")
  const chain = await run()
  const initialBotId = rows[0].id
  for (const member of roster) {
    const readCount = sandboxIds.length
    await Promise.all([
      chain.tools.readMemory.execute({}, { toolCallId: "once", messages: [] }),
      chain.tools.readMemory.execute(
        {},
        { toolCallId: "duplicate", messages: [] }
      ),
    ])
    assert.equal(
      sandboxIds.length,
      readCount + 1,
      "Only one provider read per member, even concurrently"
    )
    sandboxIds.pop()
    assert.ok(!chain.prepareStep().activeTools.includes("readMemory"))
    const target = roster[roster.indexOf(member) + 1]
    if (target) {
      assert.equal(
        (await chain.tools.handoff.execute({ botId: target.id })).botId,
        target.id
      )
      const next = chain.prepareStep()
      assert.ok(
        next.activeTools.includes("readMemory"),
        "A new member gets its own memory read"
      )
    }
  }
  assert.ok(
    !chain.prepareStep().activeTools.includes("handoff"),
    "Stop when all group members were consulted"
  )
  assert.match(
    (await chain.tools.handoff.execute({ botId: initialBotId })).error,
    /already consulted/
  )
  memoryContents.clear()
  roster = savedRoster

  uiHistory = messages
  const usage = {
    inputTokens: { total: 1, noCache: 1 },
    outputTokens: { total: 1, text: 1 },
  }
  memoryContents.set("ignored_sandbox", "")
  const mockModel = new MockLanguageModelV4({
    doStream: [
      {
        stream: simulateReadableStream({
          chunks: [
            {
              type: "tool-call",
              toolCallId: "sender_memory",
              toolName: "readMemory",
              input: "{}",
            },
            { type: "finish", finishReason: { unified: "tool-calls" }, usage },
          ],
        }),
        warnings: [],
      },
      {
        stream: simulateReadableStream({
          chunks: [
            {
              type: "tool-call",
              toolCallId: "handoff_real",
              toolName: "handoff",
              input: JSON.stringify({ botId: "target", reason: "checking notes" }),
            },
            { type: "finish", finishReason: { unified: "tool-calls" }, usage },
          ],
        }),
        warnings: [],
      },
      {
        stream: simulateReadableStream({
          chunks: [
            {
              type: "tool-call",
              toolCallId: "memory_real",
              toolName: "readMemory",
              input: "{}",
            },
            { type: "finish", finishReason: { unified: "tool-calls" }, usage },
          ],
        }),
        warnings: [],
      },
      {
        stream: simulateReadableStream({
          chunks: [
            { type: "text-start", id: "reply" },
            { type: "text-delta", id: "reply", delta: "Tutor response" },
            { type: "text-end", id: "reply" },
            { type: "finish", finishReason: { unified: "stop" }, usage },
          ],
        }),
        warnings: [],
      },
    ],
  })
  const realLoop = await chatAgent.run({
    chatId: "group_1",
    clientData: { botId: rows[0].id },
    messages: [{ role: "user", content: "Hello" }],
    tools: resolvedTools,
    signal,
    streamText: (options) => sdkStreamText({ ...options, model: mockModel }),
  })
  await realLoop.consumeStream()
  assert.equal(await realLoop.text, "Tutor response")
  assert.equal(mockModel.doStreamCalls.length, 4)
  assert.match(JSON.stringify(mockModel.doStreamCalls[0].prompt), /Grace/)
  assert.match(
    JSON.stringify(mockModel.doStreamCalls[2].prompt),
    /Teach with examples/
  )
  assert.doesNotMatch(
    JSON.stringify(mockModel.doStreamCalls[2].prompt),
    /handoff_real/
  )
  assert.equal(mockModel.doStreamCalls[2].tools?.length ?? 0, 2)
  assert.match(
    JSON.stringify(mockModel.doStreamCalls[3].prompt),
    /Memory of tutor_sandbox/
  )
  assert.doesNotMatch(
    JSON.stringify(mockModel.doStreamCalls[3].prompt),
    /handoff_real|sender_memory/
  )
  assert.deepEqual(
    mockModel.doStreamCalls[3].tools.map((t) => t.name),
    ["writeMemory"]
  )
  sandboxIds.pop()
  sandboxIds.pop()
  memoryContents.clear()
  console.log(
    "Real AI SDK stream loop switches to the receiver instructions, original request, and memory tools only."
  )

  memoryContents.set("ignored_sandbox", "")
  const managedReadsStart = sandboxIds.length
  const managedModel = new MockLanguageModelV4({
    doStream: async () => {
      const phase = (managedModel.doStreamCalls.length - 1) % 4
      return {
        stream: simulateReadableStream({
          chunks:
            phase === 0 || phase === 2
              ? [
                  {
                    type: "tool-call",
                    toolCallId: `managed_memory_${managedModel.doStreamCalls.length}`,
                    toolName: "readMemory",
                    input: "{}",
                  },
                  {
                    type: "finish",
                    finishReason: { unified: "tool-calls" },
                    usage,
                  },
                ]
              : phase === 3
                ? [
                    { type: "text-start", id: "receiver" },
                    {
                      type: "text-delta",
                      id: "receiver",
                      delta: "Managed Tutor response",
                    },
                    { type: "text-end", id: "receiver" },
                    {
                      type: "finish",
                      finishReason: { unified: "stop" },
                      usage,
                    },
                  ]
                : [
                    {
                      type: "tool-call",
                      toolCallId: `managed_handoff_${managedModel.doStreamCalls.length}`,
                      toolName: "handoff",
                      input: JSON.stringify({ botId: "target", reason: "checking notes" }),
                    },
                    {
                      type: "finish",
                      finishReason: { unified: "tool-calls" },
                      usage,
                    },
                  ],
        }),
        warnings: [],
      }
    },
  })
  writeResponse = (part) => managedChat.response.write(part)
  readHistory = () => managedChat.history.all()
  const integratedAgent = managedChat.agent({
    ...chatAgent,
    id: "handoff-integration-check",
    run: (args) =>
      chatAgent.run({
        ...args,
        streamText: (options) =>
          args.streamText({ ...options, model: managedModel }),
      }),
  })
  const harness = mockChatAgent(integratedAgent, {
    chatId: "group_1",
    clientData: { botId: rows[0].id },
  })
  try {
    for (const message of [messages[0], { ...messages[0], id: "follow-up" }]) {
      let timer
      const turn = await Promise.race([
        harness.sendMessage(message),
        new Promise((_, reject) => {
          timer = setTimeout(
            () =>
              reject(
                new Error("Managed Trigger handoff did not finish in 5 seconds")
              ),
            5000
          )
        }),
      ]).finally(() => clearTimeout(timer))
      assert.ok(
        turn.chunks.some(
          (chunk) =>
            chunk.type === "text-delta" &&
            chunk.delta === "Managed Tutor response"
        )
      )
      assert.ok(turn.chunks.some((chunk) => chunk.type === "finish"))
    }
    assert.equal(managedModel.doStreamCalls.length, 8)
    for (const index of [3, 7]) {
      assert.match(
        JSON.stringify(managedModel.doStreamCalls[index].prompt),
        /Memory of tutor_sandbox/,
        "Managed SDK must retain the receiver's memory tool result"
      )
      assert.doesNotMatch(
        JSON.stringify(managedModel.doStreamCalls[index].prompt),
        /managed_handoff_|managed_memory_(1|5)"/
      )
    }
    assert.deepEqual(sandboxIds.slice(managedReadsStart), [
      "ignored_sandbox",
      "tutor_sandbox",
      "ignored_sandbox",
      "tutor_sandbox",
    ])
    sandboxIds.splice(managedReadsStart)
    memoryContents.clear()
    console.log(
      "Full managed Trigger handoff reaches receiver text and turn completion on two consecutive turns."
    )
  } finally {
    await harness.close()
    writeResponse = (part) => responseParts.push(part)
    readHistory = () => uiHistory
  }
  console.log(
    "Handoff checks passed: owned roster, target instructions/avatar, self/non-member rejection, one visit and memory read per member per turn, and no direct-chat handoff (stubbed)."
  )
  rows = [{ kind: "group", name: null }]
  await assert.rejects(run(), /Select a bot/)
  assert.equal(
    chatAgent.clientDataSchema.safeParse({ botId: 12 }).success,
    false
  )
  rows = []
  const missingTools = chatAgent.tools({ chatId: "missing_chat" })
  await assert.rejects(
    missingTools.listFiles.execute({ path: "/tmp" }, toolOptions),
    /Sandbox operation failed/
  )
  assert.deepEqual(sandboxIds, ["owned_sandbox"])
  await assert.rejects(run(), /Chat not found/)
  queryFailure = true
  await assert.rejects(run(), /Database unavailable/)
  delete process.env.DEEPSEEK_API_KEY
  await assert.rejects(run(), /DEEPSEEK_API_KEY/)
  assert.equal(
    chatAgent.uiMessageStreamOptions.onError(new Error("secret")),
    "Could not get a reply. Please try again."
  )
} finally {
  if (oldDatabase === undefined) delete process.env.DATABASE_URL
  else process.env.DATABASE_URL = oldDatabase
  if (oldKey === undefined) delete process.env.DEEPSEEK_API_KEY
  else process.env.DEEPSEEK_API_KEY = oldKey
}
console.log(
  "Chat migration checks passed (stubbed auth, ownership, tokens, transcript reads, database, and provider)."
)

// Render the actual chat with transport/UI boundaries stubbed, including screenshot data.
const wrapper = ({ children }) => React.createElement("div", null, children)
const primitives = (names) =>
  Object.fromEntries(names.map((name) => [name, wrapper]))
const renderedMessages = [
  {
    id: "tool_message",
    role: "assistant",
    parts: [
      { type: "data-bot-avatar", data: "reply-bot-avatar" },
      { type: "text", text: "Done." },
      { type: "reasoning", text: "Provider reasoning content", state: "done" },
      {
        type: "tool-bash",
        toolCallId: "bash_1",
        state: "output-available",
        input: { command: "pwd" },
        output: { output: "/home/test" },
      },
      {
        type: "tool-viewScreen",
        toolCallId: "screen_1",
        state: "output-available",
        input: {},
        output: { screenshot: "SECRET_SCREENSHOT_BYTES" },
      },
      {
        type: "tool-viewScreen",
        toolCallId: "failed_screen",
        state: "output-error",
        input: {},
        output: { screenshot: "SECRET_ERROR_SCREENSHOT_BYTES" },
        errorText: "Screen unavailable.",
      },
      {
        type: "tool-viewScreen",
        toolCallId: "shared_screen",
        state: "output-available",
        input: { showInChat: true },
        output: { screenshot: "SHARED_SCREENSHOT_BYTES", showInChat: true },
      },
      {
        type: "dynamic-tool",
        toolName: "readFile",
        toolCallId: "read_1",
        state: "output-error",
        input: { path: "/bad" },
        errorText: "Sandbox operation failed.",
      },
      {
        type: "tool-mouseClick",
        toolCallId: "click_1",
        state: "input-streaming",
      },
    ],
  },
]
let transportClientData
const connectionEffects = []
let finishStart
let resumeCalls = 0
const loadTranscript = async () => ({ messages: renderedMessages })
const collapsibleUI = load("../components/ui/collapsible.tsx", {
  "react/jsx-runtime": jsxRuntime,
  "@base-ui/react/collapsible": { Collapsible: CollapsiblePrimitive },
})
const traceUI = load("../components/ui/trace.tsx", {
  react: React,
  "react/jsx-runtime": jsxRuntime,
  cn: { cn: (...classes) => classes.filter(Boolean).join(" ") },
  "@/components/ui/collapsible": collapsibleUI,
  "lucide-react": primitives(["ChevronRightIcon"]),
})
const { ChatTool, ChatToolActivity } = load("../components/chat-tool.tsx", {
  "react/jsx-runtime": jsxRuntime,
  ai: { getToolName },
  "lucide-react": primitives(["ListChecksIcon", "WrenchIcon"]),
  "@/components/ui/code-block": primitives(["CodeBlock", "CodeBlockContent"]),
  "@/components/ui/trace": traceUI,
})
for (const [state, label] of Object.entries({
  "input-streaming": "Preparing",
  "input-available": "Running",
  "approval-requested": "Needs approval",
  "approval-responded": "Approval received",
  "output-available": "Completed",
  "output-error": "Failed",
  "output-denied": "Denied",
})) {
  const html = renderToStaticMarkup(
    React.createElement(ChatTool, {
      output: "<script>example</script>",
      part: {
        type: "dynamic-tool",
        toolName: "readFile",
        toolCallId: "status-test",
        state,
        input: { path: "<unsafe>" },
        output: "<script>example</script>",
      },
    })
  )
  assert.ok(html.includes(label), `${state} must display ${label}`)
  assert.ok(html.includes("read File"))
  assert.ok(!html.includes("<script>"), "Tool content must remain escaped")
}
console.log(
  "Compact tool rows render all SDK states and escape untrusted content."
)
const twentyTools = Array.from({ length: 20 }, (_, i) => ({
  type: "dynamic-tool",
  toolName: "bash",
  toolCallId: `bulk-${i}`,
  state: "output-available",
  input: { command: "pwd" },
  output: { output: "/private-test-path" },
}))
const activityMarkup = renderToStaticMarkup(
  React.createElement(ChatToolActivity, { parts: twentyTools })
)
assert.match(activityMarkup, /20 actions completed/)
assert.match(activityMarkup, /aria-expanded="false"/)
assert.doesNotMatch(activityMarkup, /private-test-path/)
const activityTree = ChatToolActivity({ parts: twentyTools })
assert.equal(activityTree.props.defaultOpen, false)
assert.equal(
  activityTree.props.children[1].props.children.props.children.length,
  20,
  "All tool details remain available on expansion"
)
const runningActivity = renderToStaticMarkup(
  React.createElement(ChatToolActivity, {
    parts: [
      ...twentyTools,
      { ...twentyTools[0], toolCallId: "live", state: "input-available" },
    ],
  })
)
assert.match(runningActivity, /Working · 21 actions/)
assert.match(runningActivity, /bash/)
console.log(
  "Real collapsed activity renders one summary for 20 calls, keeps details for expansion, and reports live SDK state."
)

const chatDependencies = {
  "react/jsx-runtime": jsxRuntime,
  "next/image": {
    default: ({ unoptimized, ...props }) => {
      assert.equal(unoptimized, true)
      return React.createElement("img", props)
    },
  },
  react: { ...React, useEffect: (effect) => connectionEffects.push(effect) },
  "@/components/chat-tool": { ChatTool, ChatToolActivity },
  "@/components/chat-avatar": {
    ChatAvatar: ({ seed }) => React.createElement("i", { "data-avatar": seed }),
  },
  "@/components/ui/dropdown-menu": primitives([
    "DropdownMenu",
    "DropdownMenuContent",
    "DropdownMenuGroup",
    "DropdownMenuLabel",
    "DropdownMenuRadioGroup",
    "DropdownMenuRadioItem",
    "DropdownMenuTrigger",
  ]),
  "@/components/ui/input-group": primitives([
    "InputGroup",
    "InputGroupAddon",
    "InputGroupButton",
    "InputGroupTextarea",
  ]),
  "lucide-react": primitives([
    "ArrowUpIcon",
    "BrainIcon",
    "CheckIcon",
    "ChevronDownIcon",
    "CopyIcon",
    "MessageSquareIcon",
    "SquareIcon",
  ]),
  ai: { isToolUIPart, getToolName },
  "@ai-sdk/react": {
    useChat: () => ({
      messages: renderedMessages,
      status: "ready",
      resumeStream: async () => {
        resumeCalls++
      },
    }),
  },
  "@trigger.dev/sdk/chat/react": {
    useTriggerChatTransport: (options) => {
      transportClientData = options.clientData
      return {
        start: () =>
          new Promise((resolve) => {
            finishStart = resolve
          }),
      }
    },
    useLoadTranscript: (_chatId, load) => {
      assert.equal(
        load,
        loadTranscript,
        "Transcript loading must not await session startup"
      )
      return { messages: renderedMessages, isLoading: false }
    },
  },
  "@/actions/chat": { loadChatTranscript: loadTranscript },
  "@/components/ai-elements/message": primitives(["MessageResponse"]),
  "@/components/ui/alert": primitives(["Alert", "AlertDescription"]),
  "@/components/ui/button": primitives(["Button"]),
  "@/components/ui/badge": primitives(["Badge"]),
  "@/components/ui/bubble": primitives(["Bubble", "BubbleContent"]),
  "@/components/ui/marker": primitives([
    "Marker",
    "MarkerContent",
    "MarkerIcon",
  ]),
  "@/components/ui/message": primitives([
    "Message",
    "MessageAvatar",
    "MessageContent",
    "MessageFooter",
    "MessageHeader",
  ]),
  "@/components/ui/message-scroller": primitives([
    "MessageScroller",
    "MessageScrollerButton",
    "MessageScrollerContent",
    "MessageScrollerItem",
    "MessageScrollerProvider",
    "MessageScrollerViewport",
  ]),
  "@/components/ui/empty": primitives([
    "Empty",
    "EmptyContent",
    "EmptyDescription",
    "EmptyHeader",
    "EmptyMedia",
    "EmptyTitle",
  ]),
  "@/components/ui/spinner": primitives(["Spinner"]),
  "@/components/ui/trace": primitives([
    "Trace",
    "TraceCollapsible",
    "TraceCollapsibleContent",
    "TraceCollapsibleTrigger",
    "TraceIcon",
    "TraceLine",
    "TraceTitle",
  ]),
}
chatDependencies["@/components/chat-message"] = load(
  "../components/chat-message.tsx",
  chatDependencies
)
chatDependencies["@/components/chat-composer"] = load(
  "../components/chat-composer.tsx",
  chatDependencies
)
const { Chat } = load("../components/chat.tsx", chatDependencies)
renderedMessages[0].parts.push(
  {
    type: "tool-bash",
    toolCallId: "approval",
    state: "approval-requested",
    input: { command: "pwd" },
    approval: { id: "approval-1" },
  },
  {
    type: "tool-bash",
    toolCallId: "denied",
    state: "output-denied",
    input: { command: "pwd" },
    approval: { id: "approval-2", approved: false },
  },
  {
    type: "tool-bash",
    toolCallId: "reported-error",
    state: "output-available",
    input: { command: "pwd" },
    output: { error: "Reported tool failure" },
  }
)
const markup = renderToStaticMarkup(
  React.createElement(Chat, { chatId: "chat_1" })
)
assert.match(markup, /Done\./)
assert.match(markup, /Provider reasoning content/)
const disconnect = connectionEffects.at(-1)()
assert.match(
  markup,
  /Done\./,
  "Saved messages render while session startup is pending"
)
assert.equal(resumeCalls, 0)
finishStart()
await new Promise(setImmediate)
assert.equal(resumeCalls, 1, "Resume only after session startup")
disconnect()
const cancelConnection = connectionEffects.at(-1)()
cancelConnection()
finishStart()
await new Promise(setImmediate)
assert.equal(resumeCalls, 1, "Navigating away must cancel deferred resume")
assert.doesNotMatch(markup, /reply-bot-avatar/)
assert.match(markup, /Working · [0-9]+ actions/)
assert.match(markup, /mouse Click/)
assert.match(markup, /Failed/)
assert.doesNotMatch(
  markup,
  /home\/test/,
  "Collapsed activity hides routine tool details"
)
assert.doesNotMatch(
  markup,
  /Screen inspected/,
  "Private screenshots stay in collapsed activity"
)
assert.match(markup, /Sandbox operation failed/)
assert.match(markup, /Needs approval/)
assert.match(markup, /Denied/)
assert.match(
  markup,
  /Reported tool failure/,
  "Failures returned as tool output must stay visible"
)
assert.doesNotMatch(
  markup,
  /SECRET_SCREENSHOT_BYTES|SECRET_ERROR_SCREENSHOT_BYTES/
)
assert.match(markup, /src="data:image\/png;base64,SHARED_SCREENSHOT_BYTES"/)
assert.match(markup, /alt="Agent desktop screenshot"/)
console.log(
  "Chat render checks passed: text, static/dynamic tool calls, pending/errors, and selective screenshot display (stubbed UI boundaries)."
)

renderedMessages[0].parts.splice(
  1,
  0,
  { type: "text", text: "Sender preamble" },
  {
    type: "tool-handoff",
    toolCallId: "handoff_1",
    state: "output-available",
    input: { botId: "bot_2" },
    output: {
      botId: "bot_2",
      name: "Code reviewer",
      fromAvatar: "sender-avatar",
      reason: "checking notes",
    },
  },
  { type: "data-bot-avatar", data: "receiver-avatar" }
)
const groupMarkup = renderToStaticMarkup(
  React.createElement(Chat, {
    chatId: "group_1",
    members: [
      { id: "bot_1", name: "Ada", avatar: "ada" },
      { id: "bot_2", name: "Grace", avatar: "grace" },
    ],
  })
)
assert.deepEqual(transportClientData, { botId: "bot_1" })
assert.match(groupMarkup, /Ada/)
assert.match(groupMarkup, /Grace/)
console.log(
  "Group composer renders bot choices and sends the selected bot through transport clientData."
)

assert.match(groupMarkup, /Handed off to Code reviewer · checking notes/)
assert.match(groupMarkup, /data-avatar="receiver-avatar"/)
assert.match(groupMarkup, /data-avatar="receiver-avatar"><\/i><\/div><div><div>Done\./)
console.log(
  "Group replies use the persisted responder avatar rather than the current selection; direct replies omit it."
)

assert.doesNotMatch(groupMarkup, /Sender preamble/)
assert.match(groupMarkup, /data-avatar="sender-avatar"/)
assert.ok(
  groupMarkup.indexOf("Handed off to Code reviewer") <
    groupMarkup.indexOf('data-avatar="receiver-avatar"')
)
console.log(
  "Handoff renders the source indicator before the receiver reply and omits sender preamble."
)

renderedMessages[0].parts.splice(
  4,
  0,
  {
    type: "tool-handoff",
    toolCallId: "handoff_2",
    state: "output-available",
    input: { botId: "bot_3" },
    output: {
      botId: "bot_3",
      name: "Final respondent",
      fromAvatar: "receiver-avatar",
    },
  },
  { type: "data-bot-avatar", data: "final-avatar" }
)
const chainedMarkup = renderToStaticMarkup(
  React.createElement(Chat, {
    chatId: "group_1",
    members: [{ id: "bot_1", name: "Ada", avatar: "ada" }],
  })
)
assert.match(chainedMarkup, /Handed off to Final respondent/)
assert.doesNotMatch(chainedMarkup, /Handed off to Code reviewer/)
assert.match(chainedMarkup, /data-avatar="final-avatar"/)
renderedMessages[0].parts.splice(4, 2)

renderedMessages.push({
  id: "empty-sender",
  role: "assistant",
  parts: [
    { type: "data-bot-avatar", data: "empty-sender-avatar" },
    { type: "step-start" },
    { type: "text", text: "  " },
  ],
})
const emptyRowMarkup = renderToStaticMarkup(
  React.createElement(Chat, {
    chatId: "group_1",
    members: [{ id: "bot_1", name: "Ada", avatar: "ada" }],
  })
)
assert.doesNotMatch(emptyRowMarkup, /empty-sender-avatar/)
console.log("Group metadata-only replies do not render empty avatar rows.")

renderedMessages.push({
  id: "handoff-only",
  role: "assistant",
  parts: [
    { type: "data-bot-avatar", data: "empty-receiver-avatar" },
    {
      type: "tool-handoff",
      toolCallId: "handoff-only-call",
      state: "output-available",
      input: { botId: "bot_2" },
      output: { name: "Tutor", fromAvatar: "indicator-avatar" },
    },
  ],
})
const handoffOnlyMarkup = renderToStaticMarkup(
  React.createElement(Chat, {
    chatId: "group_1",
    members: [{ id: "bot_1", name: "Ada", avatar: "ada" }],
  })
)
assert.match(handoffOnlyMarkup, /Handed off to Tutor/)
assert.match(handoffOnlyMarkup, /indicator-avatar/)
assert.doesNotMatch(handoffOnlyMarkup, /empty-receiver-avatar/)
renderedMessages.push({
  id: "handoff-failure",
  role: "assistant",
  parts: [
    {
      type: "tool-handoff",
      toolCallId: "failed-handoff",
      state: "output-available",
      input: { botId: "self" },
      output: { error: "You are already this bot. Answer directly." },
    },
  ],
})
const failedHandoffMarkup = renderToStaticMarkup(
  React.createElement(Chat, {
    chatId: "group_1",
    members: [{ id: "bot_1", name: "Ada", avatar: "ada" }],
  })
)
assert.match(failedHandoffMarkup, /You are already this bot/)
console.log(
  "Handoff-only messages keep their indicator without an empty reply; handoff errors remain visible."
)
