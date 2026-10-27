import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"
import ts from "typescript"

let open = false
let listener
let cleanup
let destination
let sidebarState = "expanded"
let mobileOpen = true
const exports = {}
const jsx = (type, props) => ({ type, props })
const code = ts.transpileModule(
  readFileSync(
    new URL("../components/chat-search.tsx", import.meta.url),
    "utf8"
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }
).outputText

runInNewContext(code, {
  exports,
  require: (name) => {
    if (name === "react")
      return {
        useState: () => [
          open,
          (value) => {
            open = typeof value === "function" ? value(open) : value
          },
        ],
        useEffect: (effect) => {
          cleanup = effect()
        },
      }
    if (name === "react/jsx-runtime") return { jsx, jsxs: jsx }
    if (name === "@/components/ui/sidebar")
      return {
        useSidebar: () => ({
          state: sidebarState,
          isMobile: false,
          setOpenMobile: (value) => {
            mobileOpen = value
          },
        }),
      }
    if (name === "next/navigation")
      return {
        useRouter: () => ({
          push: (href) => {
            destination = href
          },
        }),
      }
    return {}
  },
  document: {
    addEventListener: (name, callback) => {
      assert.equal(name, "keydown")
      listener = callback
    },
    removeEventListener: (name, callback) => {
      assert.equal(name, "keydown")
      assert.equal(callback, listener)
      listener = undefined
    },
  },
})

const tree = exports.ChatSearch({
  chats: [{ id: "chat-123", name: "Test chat", avatar: null }],
})
function press(props, expected) {
  let prevented = false
  listener({
    key: "k",
    preventDefault: () => {
      prevented = true
    },
    ...props,
  })
  assert.equal(prevented, expected)
}
press({ metaKey: true }, true)
assert.equal(open, true)
press({ ctrlKey: true, key: "K" }, true)
assert.equal(open, false)
for (const props of [
  {},
  { metaKey: true, repeat: true },
  { ctrlKey: true, isComposing: true },
  { ctrlKey: true, altKey: true },
  { metaKey: true, shiftKey: true },
  { metaKey: true, key: "j" },
])
  press(props, false)
assert.equal(open, false)
press({ metaKey: true }, true)
const item =
  tree.props.children[1].props.children.props.children[1].props.children[1]
    .props.children[0]
item.props.onSelect()
assert.equal(destination, "/chats/chat-123")
assert.equal(mobileOpen, false)
assert.equal(open, false)
cleanup()
assert.equal(listener, undefined)
sidebarState = "collapsed"
const collapsedTree = exports.ChatSearch({ chats: [] })
const searchButton = collapsedTree.props.children[0]
assert.equal(searchButton.props.variant, "ghost")
assert.equal(searchButton.props.size, "icon")
assert.equal(searchButton.props.className, undefined)
assert.equal(searchButton.props.children[0].props["data-icon"], undefined)
assert.equal(searchButton.props.children[1], false)
cleanup()
console.log(
  "Chat search shortcut, navigation, dialog closing, and listener cleanup passed."
)
