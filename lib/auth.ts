import { betterAuth } from "better-auth"
import { nextCookies } from "better-auth/next-js"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "./database"
import * as schema from "./db/schema"

export const auth = betterAuth({
  appName: "open-mochi",
  database: drizzleAdapter(db, { provider: "pg", schema }),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
  },
  rateLimit: { enabled: true },
  plugins: [nextCookies()],
  session: { cookieCache: { enabled: false } },
})
