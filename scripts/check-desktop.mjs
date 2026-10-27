import * as sentryCore from "@sentry/core"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import { z } from "zod"
import * as jsx from "react/jsx-runtime"

function load(path, dependencies) {
  const exports = {}
  const source = ts.transpileModule(
    readFileSync(new URL(path, import.meta.url), "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
      },
    }
  ).outputText
  new Function("require", "exports", source)((name) => {
    if (name === "@sentry/core") return sentryCore
    assert.ok(name in dependencies, `Unexpected dependency ${name}`)
    return dependencies[name]
  }, exports)
  return exports
}

let authenticated = true
let chat = { botSandboxId: "owned_sandbox" }
let fail = false
const calls = []
const { connectDesktop } = load("../actions/desktop.ts", {
  zod: { z },

  "@/lib/session": {
    requireSession: async () => {
      if (!authenticated) throw new Error("Unauthorized")
      return { userId: "user_1" }
    },
  },
  "@/queries/chats": {
    getChat: async (id) => {
      calls.push(["authorize", id])
      return chat
    },
  },

  "@/lib/sandbox": {
    openSandbox: async (userId, id) => {
      assert.equal(userId, "user_1")
      calls.push(["get", id])
      if (fail) throw new Error("secret provider detail")
      return {
        state: "stopped",
        start: async () => calls.push(["start"]),
        computerUse: { start: async () => calls.push(["desktop"]) },
        getSignedPreviewUrl: async (...args) => {
          calls.push(["signed", ...args])
          return { url: "https://6080-signed.example.test" }
        },
      }
    },
  },
})

authenticated = false
await assert.rejects(connectDesktop("chat_1"), /Unauthorized/)
authenticated = true
assert.ok((await connectDesktop({ sandboxId: "spoof" })).error)
assert.equal(calls.length, 0)
chat = undefined
assert.ok((await connectDesktop("other_users_chat")).error)
assert.deepEqual(calls, [["authorize", "other_users_chat"]])
calls.length = 0
chat = { kind: "group", botSandboxId: "owned_sandbox" }
assert.ok((await connectDesktop("group_1")).error)
assert.deepEqual(calls, [["authorize", "group_1"]])
calls.length = 0
chat = { botSandboxId: "owned_sandbox" }
assert.deepEqual(await connectDesktop("chat_1"), {
  url: "wss://6080-signed.example.test/websockify",
})
assert.deepEqual(calls, [
  ["authorize", "chat_1"],
  ["get", "owned_sandbox"],
  ["desktop"],
  ["signed", 6080, 300],
])
fail = true
assert.deepEqual(await connectDesktop("chat_1"), {
  error: "Could not connect to the desktop. Please retry.",
})

let desktopResult = { url: "wss://signed.test/websockify" }
const refs = []
const effects = []
const setters = []
const connections = []
const host = {
  className: "",
  remove() {
    this.removed = true
  },
}
const destination = () => ({
  appendChild(node) {
    this.child = node
  },
})
const originalDocument = globalThis.document
globalThis.document = { createElement: () => host }
const pass = () => null
const { SandboxDesktop } = load("../components/sandbox-desktop.tsx", {
  "react/jsx-runtime": jsx,
  react: {
    useRef: (current) => {
      const ref = { current }
      refs.push(ref)
      return ref
    },
    useEffect: (fn) => effects.push(fn),
    useCallback: (fn) => fn,
    useState: (initial) => {
      const changes = []
      setters.push(changes)
      return [initial, (value) => changes.push(value)]
    },
  },
  "@/actions/desktop": {
    connectDesktop: async () => desktopResult,
  },
  "@novnc/novnc": {
    default: class {
      constructor(target, url) {
        this.target = target
        this.url = url
        this.disconnected = false
        connections.push(this)
      }
      addEventListener() {}
      focus() {
        this.focused = true
      }
      disconnect() {
        this.disconnected = true
      }
    },
  },
  "@/components/ui/button": { Button: pass },
  "@/components/ui/alert": { Alert: pass, AlertDescription: pass },
  "@/components/ui/dialog": {
    Dialog: "dialog-root",
    DialogContent: "dialog-content",
    DialogDescription: pass,
    DialogHeader: pass,
    DialogTitle: pass,
  },
})
try {
  const tree = SandboxDesktop({ chatId: "chat_1", name: "Ada" })
  const preview = destination()
  refs[0].current = preview
  const cleanup = effects[0]()
  await new Promise(setImmediate)
  assert.equal(connections.length, 1)
  const connection = connections[0]
  assert.equal(connection.viewOnly, true)
  assert.equal(preview.child, host)
  const dialog = tree.props.children.find(
    (child) => child?.type === "dialog-root"
  )
  assert.equal(dialog.props.disablePointerDismissal, true)
  for (const reason of [
    "escape-key",
    "outside-press",
    "focus-out",
    "imperative-action",
  ]) {
    let canceled = false
    dialog.props.onOpenChange(false, {
      reason,
      cancel: () => {
        canceled = true
      },
    })
    assert.equal(canceled, true)
  }
  assert.equal(setters[0].length, 0)
  dialog.props.onOpenChange(false, { reason: "close-press" })
  assert.deepEqual(setters[0], [false])
  const mountScreen = dialog.props.children.props.children[1].props.ref
  const popup = destination()
  mountScreen(popup)
  assert.equal(popup.child, host)
  assert.equal(connection.viewOnly, false)
  assert.equal(connection.focused, true)
  mountScreen(null)
  assert.equal(preview.child, host)
  assert.equal(connection.viewOnly, true)
  mountScreen(popup)
  assert.equal(connections.length, 1)
  assert.equal(connection.disconnected, false)
  cleanup()
  assert.equal(connection.disconnected, true)

  fail = false
  chat = { botSandboxId: null }
  desktopResult = await connectDesktop("chat_1")
  assert.equal(
    desktopResult.error,
    "This bot has no desktop. Create a new bot to get a desktop."
  )
  refs.length = 0
  effects.length = 0
  setters.length = 0
  SandboxDesktop({ chatId: "chat_1", name: "Fe test" })
  refs[0].current = destination()
  const cleanupMissing = effects[0]()
  await new Promise(setImmediate)
  assert.deepEqual(setters[1], ["error"])
  assert.deepEqual(setters[2], [desktopResult.error])
  assert.equal(connections.length, 1)
  cleanupMissing()
} finally {
  if (originalDocument === undefined) delete globalThis.document
  else globalThis.document = originalDocument
}
console.log(
  "Desktop checks passed: auth, ownership, signed port-scoped URL, provider failure, one VNC connection, canvas reuse, input mode, and explicit-close-only dialog (stubbed)."
)
