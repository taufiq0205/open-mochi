import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { createRequire } from "node:module"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import ts from "typescript"

const require = createRequire(import.meta.url)
const compiled = ts.transpileModule(
  readFileSync(
    new URL("../components/ai-elements/schema-display.tsx", import.meta.url),
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
const components = {}
new Function("require", "exports", compiled)((name) => {
  if (name === "@/lib/utils")
    return { cn: (...values) => values.filter(Boolean).join(" ") }
  if (name.startsWith("@/components/ui/")) return {}
  return require(name)
}, components)
const renderPath = (path, children) =>
  renderToStaticMarkup(
    createElement(
      components.SchemaDisplay,
      { method: "GET", path },
      createElement(components.SchemaDisplayPath, null, children)
    )
  )
assert.match(
  renderPath("/users/{id}"),
  /\/users\/<span class="text-primary">\{id\}<\/span>/
)
const escaped = renderPath('/<img src=x onerror="alert(1)">/{id}')
assert.ok(!escaped.includes("<img"))
assert.ok(escaped.includes("&lt;img"))
assert.match(
  renderPath("/users", createElement("strong", null, "Custom path")),
  /<strong>Custom path<\/strong>/
)
console.log("AI Elements path rendering checks passed.")
