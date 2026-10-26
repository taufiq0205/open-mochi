import { relations } from "drizzle-orm"
import {
  index,
  integer,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core"
import { nanoid } from "nanoid"
import { createInsertSchema } from "drizzle-zod"
import { z } from "zod"

export const bots = pgTable(
  "bots",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(),
    name: text("name").notNull(),
    avatar: text("avatar")
      .notNull()
      .$defaultFn(() => nanoid()),
    job: text("job").notNull(),
    instructions: text("instructions"),
    sandboxId: text("sandbox_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("bots_user_id_idx").on(table.userId)]
)

export const chatKind = pgEnum("chat_kind", ["direct", "group"])

export const chats = pgTable(
  "chats",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => nanoid()),
    userId: text("user_id").notNull(),
    kind: chatKind("kind").notNull().default("direct"),
    name: text("name"),
    lastMessagePreview: text("last_message_preview"),
    lastMessageAt: timestamp("last_message_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("chats_user_id_idx").on(table.userId)]
)

export const chatMembers = pgTable(
  "chat_members",
  {
    chatId: text("chat_id")
      .notNull()
      .references(() => chats.id, { onDelete: "cascade" }),
    botId: text("bot_id")
      .notNull()
      .references(() => bots.id, { onDelete: "cascade" }),
    joinedAt: timestamp("joined_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.chatId, table.botId] }),
    index("chat_members_bot_id_idx").on(table.botId),
  ]
)

export const usagePeriods = pgTable(
  "usage_periods",
  {
    userId: text("user_id").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
    aiMicros: integer("ai_micros").notNull().default(0),
    sandboxMicros: integer("sandbox_micros").notNull().default(0),
  },
  (table) => [primaryKey({ columns: [table.userId, table.periodStart] })]
)

export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    periodStart: timestamp("period_start", { withTimezone: true }).notNull(),
    meter: text("meter", { enum: ["ai", "sandbox"] }).notNull(),
    amountMicros: integer("amount_micros").notNull(),
    settledAt: timestamp("settled_at", { withTimezone: true }),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    sandboxName: text("sandbox_name"),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    readyAt: timestamp("ready_at", { withTimezone: true }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    purpose: text("purpose", { enum: ["create", "use"] }),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [
    index("usage_ledger_user_period_idx").on(table.userId, table.periodStart),
  ]
)

export const botsRelations = relations(bots, ({ many }) => ({
  memberships: many(chatMembers),
}))

export const chatsRelations = relations(chats, ({ many }) => ({
  members: many(chatMembers),
}))

export const chatMembersRelations = relations(chatMembers, ({ one }) => ({
  chat: one(chats, {
    fields: [chatMembers.chatId],
    references: [chats.id],
  }),
  bot: one(bots, {
    fields: [chatMembers.botId],
    references: [bots.id],
  }),
}))

export const insertBotSchema = createInsertSchema(bots, {
  name: (schema) => schema.trim().min(1, "Name is required").max(100),
  job: (schema) => schema.trim().min(1, "Job is required").max(200),
  avatar: (schema) => schema.trim().min(1).max(100),
  instructions: (schema) => schema.trim().max(10000),
})

export const createBotSchema = insertBotSchema
  .pick({
    name: true,
    job: true,
    avatar: true,
    instructions: true,
  })
  .extend({
    avatar: z.string().trim().min(1).max(100),
    instructions: z.string().trim().max(10000),
  })

export type CreateBotInput = z.infer<typeof createBotSchema>

export const createGroupChatSchema = createInsertSchema(chats, {
  name: z.string().trim().min(1, "Name is required").max(100),
})
  .pick({ name: true })
  .extend({
    botIds: z
      .array(z.string().trim().min(1).max(100))
      .min(2, "Pick at least two bots")
      .refine((ids) => new Set(ids).size === ids.length, "Pick each bot once"),
  })

export type CreateGroupChatInput = z.infer<typeof createGroupChatSchema>
