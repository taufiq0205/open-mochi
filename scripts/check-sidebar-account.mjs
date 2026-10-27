import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import * as React from "react"
import * as jsx from "react/jsx-runtime"
import { renderToStaticMarkup } from "react-dom/server"
const source = ts.transpileModule(
  readFileSync(
    new URL("../components/account-button.tsx", import.meta.url),
    "utf8"
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
      target: ts.ScriptTarget.ES2022,
    },
  }
).outputText
let sidebarState = "collapsed",
  mobile = false,
  failure = false,
  thrown = false,
  calls = 0
const routes = []
let states = [],
  cursor = 0
const pass = ({ children }) => React.createElement("div", null, children)
const dependencies = {
  "react/jsx-runtime": jsx,
  react: {
    useState: (initial) => {
      const key = cursor++
      if (!(key in states)) states[key] = initial
      return [
        states[key],
        (value) => {
          states[key] = value
        },
      ]
    },
  },
  "next/link": {
    default: ({ children, href, ...props }) =>
      React.createElement("a", { href, ...props }, children),
  },
  "next/navigation": {
    useRouter: () => ({
      replace: (href) => routes.push(href),
      refresh: () => routes.push("refresh"),
    }),
  },
  "@/lib/auth-client": {
    authClient: {
      useSession: () => ({
        data: {
          user: {
            name: "A very long account name",
            email: "test@example.test",
          },
        },
      }),
      signOut: async () => {
        calls++
        if (thrown) throw new Error("network")
        return { error: failure ? {} : undefined }
      },
    },
  },
  "@/components/ui/sidebar": {
    useSidebar: () => ({ state: sidebarState, isMobile: mobile }),
  },
  "lucide-react": {
    ChevronsUpDownIcon: () => null,
    LogOutIcon: () => null,
    ChartNoAxesCombinedIcon: () => null,
    UserRoundIcon: () => null,
  },
  "@/components/ui/button": {
    Button: ({ children, ...props }) =>
      React.createElement("button", props, children),
  },
  "@/components/ui/dropdown-menu": Object.fromEntries(
    [
      "DropdownMenu",
      "DropdownMenuTrigger",
      "DropdownMenuContent",
      "DropdownMenuGroup",
      "DropdownMenuLabel",
      "DropdownMenuItem",
      "DropdownMenuSeparator",
    ].map((name) => [name, pass])
  ),
}
const exports = {}
new Function("require", "exports", source)((name) => {
  assert.ok(name in dependencies, `Unexpected dependency ${name}`)
  return dependencies[name]
}, exports)
const render = () => {
  cursor = 0
  return exports.AccountButton()
}
function find(node, test) {
  if (!node || typeof node !== "object") return
  if (test(node)) return node
  for (const child of React.Children.toArray(node.props?.children)) {
    const result = find(child, test)
    if (result) return result
  }
}
let tree = render()
assert.doesNotMatch(renderToStaticMarkup(tree), /href="\/(usage|pricing)"/)
const trigger = find(
  tree,
  (node) => node.props?.["aria-label"] === "Account menu"
)
assert.ok(
  trigger,
  "Collapsed footer needs one compact account-menu trigger instead of inline account controls"
)
assert.equal(trigger.props.render.props.size, "icon")
sidebarState = "expanded"
tree = render()
assert.equal(
  find(tree, (node) => node.props?.["aria-label"] === "Account menu").props
    .render.props.size,
  "default"
)
mobile = true
sidebarState = "collapsed"
tree = render()
assert.equal(
  find(tree, (node) => node.props?.["aria-label"] === "Account menu").props
    .render.props.size,
  "default"
)
const logout = () =>
  find(
    render(),
    (node) => node.props?.["aria-label"] === "Sign out"
  ).props.onClick()
failure = true
await logout()
assert.ok(renderToStaticMarkup(render()).includes("Could not sign out"))
assert.deepEqual(routes, [])
failure = false
thrown = true
await logout()
assert.ok(renderToStaticMarkup(render()).includes("Could not sign out"))
assert.deepEqual(routes, [])
thrown = false
await logout()
assert.equal(calls, 3)
assert.deepEqual(routes, ["/sign-in", "refresh"])
console.log(
  "Account menu checks passed: compact collapsed trigger, expanded/mobile layout, logout success and recoverable failures."
)
