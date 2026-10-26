> Authentication now uses Better Auth. Clerk references below describe the temporary billing backend; see [auth setup](auth.md). Checkout and Clerk account menus are unavailable pending Lago migration.

# Subscription-period usage

Pro remains USD 20/month. Clerk is the source of subscription status and period start/end; there is no calendar-month approximation, top-up wallet, or automatic overage charge. A missing/unverifiable period denies provider usage.

Per Clerk subscription period:

- USD 5 of AI allowance, enforced before **each** provider request, including tool-loop steps.
- USD 5 of conservative sandbox allocations, including creation, compute and storage.
- At most 3 stored bots, independent of the billing-period reset.
- At most 1 active/provisioning sandbox per user across all chats and periods.

`usage_periods` stores admitted totals. `usage_ledger` records individual reservations, confirmed token counts, settlement, and sandbox leases. PostgreSQL transaction-scoped advisory locks serialize admission per user. Settlements are idempotent. Ledger rows survive bot deletion, so deleting/recreating bots never restores an allowance. Old periods stay intact; a verified new period uses a new row.

## AI accounting

`lib/usage-policy.ts` contains the reviewed rates, in USD millionths. At the October 25, 2026 peak prices, DeepSeek Flash costs USD 0.30 per million uncached input tokens and USD 1.20 per million output tokens. We conservatively use peak, uncached pricing even when the actual provider price is lower. This is an allowance estimate, not invoice reconciliation.

The model middleware caps output at 4096 tokens and reserves the full documented context ceiling, rounded up to 1.1 million input tokens, before each call. Confirmed usage releases the unused reservation. Aborts, missing usage, and uncertain provider failures retain the reservation. Calls near the limit can be rejected even when their eventual actual cost would have fit. Automatic model retries are disabled. Provider calls cannot run before successful database admission.

## Sandbox accounting and cutoff

Every new session allocates up to six minutes of compute (five usable minutes plus cutoff buffer) and 24.1 hours of disk. This includes a storage safety buffer. Limits reject GPUs and allocations above 4 CPU / 8 GiB RAM / 10 GiB disk. Creation reserves that maximum; normal leases use the sandbox's actual allocation. Completed/failed sandbox allocations are not refunded.

Before starting compute, set Daytona's absolute TTL to at most six minutes and schedule `stop-sandbox-lease` for the five-minute lease deadline (or period end, whichever comes first). Only a confirmed stop extends TTL to 24 hours for file retention. A one-minute scheduled sweep retries expired leases. Duplicate stop tasks take the same user lock and check the closed lease before touching a sandbox. A reconnect never extends a lease or charges it twice. Every tool operation rechecks admission.

If stop delivery/provider operations fail, Daytona destroys the sandbox and its files at the short TTL. Stopped files otherwise expire after 24 hours without use. Expired bot records still occupy a slot; delete/recreate the bot. The app does not claim indefinite persistent sandbox files. Provider/clock/TTL enforcement itself is an external dependency; this is not a guarantee against vendor outages or changed vendor prices.

## Operations

1. Apply schema changes only with `npm run db:push`. This repo requires a clean development slate; never backfill historical usage. Delete the old development sandboxes before clearing their bot/chat rows so provider resources are not orphaned.
2. Keep `DATABASE_URL`, `CLERK_SECRET_KEY`, and `DAYTONA_API_KEY` in the matching Next.js/Trigger environments; the chat worker also needs `DEEPSEEK_API_KEY`. Preserve environment-specific Trigger secret keys. Do not mix development and production Clerk instances.
3. Run the Trigger development worker when testing locally. Deploy `chat-agent`, `stop-sandbox-lease`, and `sweep-sandbox-leases` together for production. Existing chat sessions need the new worker version before this enforcement covers them. No production deployment is implied by local validation.
4. Verify the scheduled stopper and sweep are active in the intended Trigger environment. The hard TTL is the fallback if they cannot run.
5. Run `node scripts/check-usage.mjs` for provider-boundary checks. `node scripts/check-usage.mjs --live` also checks PostgreSQL concurrency, settlement, period separation, reconnects and bot limits using only uniquely named test rows, then removes those rows.
6. Review rates before changing the provider model, sandbox geometry, or prices. No user-controlled values set rates, allowance amounts, resource IDs, or billing periods.

The Usage page is `/usage`, exposed through `AccountButton` using Clerk's supported `UserButton.Link`. It shows reserved-inclusive progress, token counts, bot slots, and time until the verified period end in MYT. Refreshing the page fetches current totals.

Sources reviewed October 25, 2026:

- https://api-docs.deepseek.com/quick_start/pricing
- https://www.daytona.io/pricing
- https://www.daytona.io/docs/en/typescript-sdk/sandbox/#setttl
- https://clerk.com/docs/nextjs/guides/customizing-clerk/adding-items/user-button
- Installed AI SDK 7 middleware documentation in `node_modules/ai/docs/03-ai-sdk-core/40-middleware.mdx`.
