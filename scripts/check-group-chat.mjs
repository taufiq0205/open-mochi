import * as sentryCore from "@sentry/core"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import ts from "typescript"
import * as zod from "zod"
import * as orm from "drizzle-orm"
import { PgDialect } from "drizzle-orm/pg-core"
import * as schema from "../lib/db/schema.ts"
import * as jsx from "react/jsx-runtime"
import * as React from "react"
import { renderToStaticMarkup } from "react-dom/server"

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
    if (name === "@sentry/core") return sentryCore
    assert.ok(name in dependencies, `Unexpected dependency: ${name}`)
    return dependencies[name]
  }, exports)
  return exports
}
const valid = { name: " Weekend plans ", botIds: ["bot_1", "bot_2"] }
assert.equal(schema.createGroupChatSchema.parse(valid).name, "Weekend plans")
for (const value of [
  null,
  {},
  { ...valid, name: " " },
  { ...valid, name: "a".repeat(101) },
  { ...valid, botIds: ["bot_1"] },
  { ...valid, botIds: ["bot_1", "bot_1"] },
]) {
  assert.equal(schema.createGroupChatSchema.safeParse(value).success, false)
}
let authenticated = true
let owned = [{ id: "bot_1" }, { id: "bot_2" }]
let failing = false
let transactions = 0
const writes = []
const paths = []
let groupExists = true
let deleteCalls = 0
function checkGroupPredicate(predicate) {
  const query = new PgDialect().sqlToQuery(predicate)
  assert.deepEqual(query.params, ["group_1", "user_1", "group"])
  assert.match(query.sql, /"chats"\."user_id"/)
  assert.match(query.sql, /"chats"\."kind"/)
}
const { createGroupChat, updateGroupChat, deleteGroupChat } = load(
  "../actions/group-chat.ts",
  {
    "@/lib/session": {
      requireSession: async () => {
        if (!authenticated) throw new Error("Unauthorized")
        return { userId: "user_1" }
      },
    },
    "drizzle-orm": orm,
    zod,
    "next/cache": { revalidatePath: (...args) => paths.push(args) },
    "@/lib/db/schema": schema,
    "@/lib/db": {
      db: {
        delete: (table) => ({
          where: (predicate) => {
            assert.equal(table, schema.chats)
            checkGroupPredicate(predicate)
            deleteCalls++
            return {
              returning: async () => {
                if (failing) throw new Error("Database unavailable")
                return groupExists ? [{ id: "group_1" }] : []
              },
            }
          },
        }),
        transaction: async (callback) => {
          transactions++
          if (failing) throw new Error("Database unavailable")
          const pending = []
          const result = await callback({
            update: (table) => ({
              set: (value) => ({
                where: (predicate) => {
                  assert.equal(table, schema.chats)
                  checkGroupPredicate(predicate)
                  pending.push({ table, value })
                  return {
                    returning: async () =>
                      groupExists ? [{ id: "group_1" }] : [],
                  }
                },
              }),
            }),
            delete: (table) => ({
              where: async (predicate) => {
                assert.equal(table, schema.chatMembers)
                const query = new PgDialect().sqlToQuery(predicate)
                assert.deepEqual(query.params, ["group_1", "bot_1", "bot_2"])
                assert.match(query.sql, /not in/)
                pending.push({ table, remove: true })
              },
            }),
            select: () => ({
              from: () => ({
                where: (predicate) => {
                  const query = new PgDialect().sqlToQuery(predicate)
                  assert.ok(query.params.includes("user_1"))
                  assert.match(query.sql, /"bots"\."user_id"/)
                  return { for: async () => owned }
                },
              }),
            }),
            insert: (table) => ({
              values: (value) => {
                pending.push({ table, value })
                return table === schema.chats
                  ? { returning: async () => [{ id: "group_1" }] }
                  : {
                      then: (resolve) => resolve(),
                      onConflictDoNothing: async () => {},
                    }
              },
            }),
          })
          writes.push(...pending)
          return result
        },
      },
    },
  }
)

authenticated = false
await assert.rejects(createGroupChat(valid), /Unauthorized/)
assert.equal(transactions, 0)
authenticated = true
assert.ok((await createGroupChat({})).error)
assert.equal(transactions, 0)
assert.deepEqual(
  await createGroupChat({
    ...valid,
    userId: "attacker",
    kind: "direct",
    id: "spoof",
  }),
  { chatId: "group_1" }
)
assert.deepEqual(writes[0].value, {
  userId: "user_1",
  kind: "group",
  name: "Weekend plans",
})
assert.deepEqual(writes[1].value, [
  { chatId: "group_1", botId: "bot_1" },
  { chatId: "group_1", botId: "bot_2" },
])
assert.deepEqual(paths, [["/(dashboard)", "layout"]])
owned = [{ id: "bot_1" }]
assert.ok((await createGroupChat(valid)).error)
assert.equal(writes.length, 2)
failing = true
assert.ok((await createGroupChat(valid)).error)
assert.equal(paths.length, 1)

// Updates must scope the group, validate every bot, and commit membership changes together.
authenticated = false
for (const action of [
  () => updateGroupChat("group_1", valid),
  () => deleteGroupChat("group_1"),
])
  await assert.rejects(action, /Unauthorized/)
authenticated = true
const beforeInvalid = transactions
assert.ok((await updateGroupChat({}, valid)).error)
assert.ok(
  (await updateGroupChat("group_1", { ...valid, botIds: ["bot_1"] })).error
)
assert.equal(transactions, beforeInvalid)
assert.ok((await deleteGroupChat(" ")).error)
assert.equal(deleteCalls, 0)
failing = false
owned = [{ id: "bot_1" }, { id: "bot_2" }]
const beforeUpdate = writes.length
assert.deepEqual(
  await updateGroupChat("group_1", {
    ...valid,
    userId: "attacker",
    kind: "direct",
    id: "spoof",
  }),
  { success: true }
)
assert.deepEqual(writes[beforeUpdate].value, { name: "Weekend plans" })
assert.equal(writes[beforeUpdate + 1].remove, true)
assert.deepEqual(writes[beforeUpdate + 2].value, [
  { chatId: "group_1", botId: "bot_1" },
  { chatId: "group_1", botId: "bot_2" },
])
const committed = writes.length
owned = [{ id: "bot_1" }]
assert.ok((await updateGroupChat("group_1", valid)).error)
assert.equal(writes.length, committed)
groupExists = false
assert.ok((await updateGroupChat("group_1", valid)).error)
assert.ok((await deleteGroupChat("group_1")).error)
assert.equal(writes.length, committed)
groupExists = true
assert.deepEqual(await deleteGroupChat("group_1"), { success: true })
failing = true
assert.ok((await updateGroupChat("group_1", valid)).error)
assert.ok((await deleteGroupChat("group_1")).error)
assert.equal(paths.length, 3)

const { GroupChatAvatar } = load("../components/group-chat-avatar.tsx", {
  "react/jsx-runtime": jsx,
  "@/lib/utils": { cn: (...classes) => classes.filter(Boolean).join(" ") },
  "@/components/chat-avatar": {
    ChatAvatar: ({ seed, className }) =>
      React.createElement("i", { "data-seed": seed, className }),
  },
})
for (const count of [0, 1, 2, 3, 4, 7]) {
  const members = Array.from({ length: count }, (_, i) => ({
    id: `bot_${i}`,
    name: `Bot ${i}`,
    avatar: `seed_${i}`,
  }))
  const html = renderToStaticMarkup(
    React.createElement(GroupChatAvatar, { members })
  )
  assert.match(html, /size-8 shrink-0/)
  assert.equal((html.match(/data-seed=/g) ?? []).length, Math.min(count, 3))
  if (count > 3) assert.ok(html.includes(`+${count - 3}`))
  if (count === 2) assert.match(html, /top-1\/4/)
  if (count === 3) assert.match(html, /left-1\/4 top-0/)
}
console.log(
  "Group checks passed: validation, auth, ownership, spoofing, atomic writes, database failure, and avatar layouts (stubbed boundaries)."
)
