import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import * as React from "react"
import * as jsx from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"

function load(path, dependencies) {
  const exports = {}
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
  new Function("require", "exports", compiled)((name) => {
    if (name === "react/jsx-runtime") return jsx
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, exports)
  return exports
}
const wrapper = ({ children }) => React.createElement("div", null, children)
const common = {
  "@/components/group-chat-dialog": { GroupChatDialog: wrapper },
  "@/components/group-chat-avatar": { GroupChatAvatar: () => null },
  "@/components/bot-dialog": { BotDialog: wrapper },
  "@/components/chat-avatar": { ChatAvatar: () => null },
  "@/components/ui/dialog": {
    DialogTrigger: ({ children }) =>
      React.createElement("button", null, children),
  },
  "@/components/ui/button": {
    Button: ({ children, ...props }) =>
      React.createElement("button", props, children),
  },
  "@/components/ui/sidebar": { SidebarTrigger: () => null },
  "lucide-react": { MonitorIcon: () => null },
  react: React,
  "@/components/chat-desktop": {
    useChatDesktop: () => ({
      panelRef: { current: null },
      panelId: "desktop",
      open: false,
    }),
  },
}
const { ChatHeader } = load("../components/chat-header.tsx", common)
let chat = {
  id: "owned-chat",
  kind: "direct",
  botId: "bot",
  botName: "Mochi",
  members: [],
}
const header = () =>
  renderToStaticMarkup(React.createElement(ChatHeader, { chat }))
assert.match(header(), /aria-label="Sandbox desktop"/)
chat = { ...chat, kind: "group", name: "Team" }
assert.doesNotMatch(header(), /Sandbox desktop|aria-controls="desktop"/)

const { default: Page } = load("../app/(dashboard)/chats/[chatId]/page.tsx", {
  "next/navigation": {
    notFound() {
      throw new Error("Not found")
    },
  },
  "@/queries/chats": { getChat: async () => chat, getUserBots: async () => [] },
  "@/components/chat-header": { ChatHeader: wrapper },
  "@/components/chat": { Chat: wrapper },
  "@/components/chat-desktop": {
    ChatDesktopProvider: wrapper,
    ChatWorkspace: ({ children }) =>
      React.createElement("sandbox-workspace", null, children),
  },
})
const renderPage = async () =>
  renderToStaticMarkup(
    await Page({ params: Promise.resolve({ chatId: "owned-chat" }) })
  )
assert.doesNotMatch(await renderPage(), /sandbox-workspace/)
chat = { ...chat, kind: "direct" }
assert.match(await renderPage(), /sandbox-workspace/)
chat = undefined
await assert.rejects(renderPage(), /Not found/)
console.log(
  "Workspace checks passed: direct-only sandbox control/panel, group exclusion, and missing-chat denial."
)

let mobileOpen = true
const { ChatSidebarButton } = load("../components/chat-sidebar-button.tsx", {
  "next/link": { default: "a" },
  "next/navigation": { usePathname: () => "/chats/selected" },
  "@/components/ui/sidebar": {
    SidebarMenuButton: "nav-button",
    useSidebar: () => ({
      setOpenMobile: (value) => {
        mobileOpen = value
      },
    }),
  },
})
const link = ChatSidebarButton({
  chatId: "selected",
  name: "Mochi",
  children: "Mochi",
})
assert.equal(link.props.isActive, true)
link.props.onClick()
assert.equal(mobileOpen, false)
console.log(
  "Sidebar selection closes the mobile drawer and retains active-chat state."
)

const { ThemeProvider } = load("../components/theme-provider.tsx", {
  react: React,
  "next-themes": { ThemeProvider: "theme-provider", useTheme: () => ({}) },
})
assert.equal(ThemeProvider({ children: null }).props.defaultTheme, "dark")
assert.equal(
  ThemeProvider({ children: null, defaultTheme: "light" }).props.defaultTheme,
  "light"
)
console.log("Dark is the default theme; explicit overrides remain supported.")
