import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import { drizzle } from "drizzle-orm/node-postgres"
import * as orm from "drizzle-orm"
import * as schema from "../lib/db/schema.ts"

let authenticated = true
let selects = 0
const mock = drizzle.mock()
const dependencies = {
  "server-only": {},
  "@clerk/nextjs/server": {
    auth: {
      protect: async () => {
        if (!authenticated) throw new Error("Unauthorized")
        return { userId: "user_1" }
      },
    },
  },
  "drizzle-orm": orm,
  "@/lib/db/schema": schema,
  "@/lib/db": {
    db: {
      select: (fields) => {
        selects++
        const builder = mock.select(fields)
        if (!fields.id) return builder
        // Compile the real query without connecting to a database.
        const from = builder.from.bind(builder)
        builder.from = (...args) => {
          const query = from(...args)
          const orderBy = query.orderBy.bind(query)
          query.orderBy = (...order) => orderBy(...order).toSQL()
          return query
        }
        return builder
      },
    },
  },
}
const compiled = ts.transpileModule(
  readFileSync(new URL("../queries/chats.ts", import.meta.url), "utf8"),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  }
).outputText
const queries = {}
new Function("require", "exports", compiled)((name) => {
  assert.ok(name in dependencies, `Unexpected dependency: ${name}`)
  return dependencies[name]
}, queries)
authenticated = false
await assert.rejects(queries.getUserChats(), /Unauthorized/)
assert.equal(selects, 0)
authenticated = true
const { sql, params } = await queries.getUserChats("attacker")
assert.match(sql, /"bots"\."user_id" = \$\d/)
assert.match(sql, /where "chats"\."user_id" = \$\d/)
assert.match(sql, /left join lateral/)
assert.match(sql, /"chat_members"\."joined_at" asc/)
assert.match(sql, /order by "chats"\."last_message_at" desc/)
assert.equal(params.filter((value) => value === "user_1").length, 4)
assert.ok(!params.includes("attacker"))
console.log(
  "Chat query checks passed: auth, user scope, bot ownership, first bot, and ordering (no database connection)."
)
