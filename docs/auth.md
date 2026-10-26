# Better Auth

Email/password authentication runs inside the Next.js web service, using Drizzle
and the existing PostgreSQL volume. No separate auth container or Clerk login key
is required. Set a stable random `BETTER_AUTH_SECRET` (at least 32 characters) and
`BETTER_AUTH_URL` to the exact browser-facing origin, including the port. Use HTTPS
for remote hosting. Never build the signing secret into the image.

Run the documented `docker compose run --rm --build db-tools` schema push before
starting the web image. This adds `auth_user`, `auth_session`, `auth_account`, and
`auth_verification`; it does not reset existing application data. Review any
unexpected destructive proposal. Back up the full database, including auth tables.

Sign up at `/sign-up`, sign in at `/sign-in`, and sign out from the sidebar.
Passwords require 12–128 characters. Better Auth handles password hashing, session
expiry/revocation, secure cookies, origin checks, and rate limiting (enabled in development and production).
Sessions are validated against PostgreSQL; cookie session caching is disabled.
The Next.js `nextCookies` plugin forwards cookie updates from server actions.
Authenticated visitors to sign-in/signup are redirected home. Identity-only
queries use `requireSession`; paid actions use `getAccess` separately, so billing
failures cannot block ordinary authenticated pages. Client gates use the native
Better Auth session plus an advisory entitlement lookup.
Email/password registration does not verify mailbox ownership. Email delivery,
password recovery, OAuth, and MFA are not configured in this migration.

## Ownership and temporary billing boundary

Application ownership uses the Better Auth user's immutable `id` everywhere,
including worker-side paid checks and usage accounting. Signup accepts no ownership
ID or billing link. Existing Clerk users, passwords, sessions, bots, chats, usage,
and subscriptions are **not automatically migrated or linked by email**.
Existing application rows keep their original owner IDs and remain inaccessible
to new accounts. Do not relabel owners without a reviewed identity migration.

Until `migration/billing-lago`, `requirePaidUser` looks up `auth_user.clerk_user_id`
by the trusted application owner ID, then checks Clerk Billing using that mapping.
Missing/deleted users and missing mappings are denied before any Clerk request.
The field is unique, excluded from API input/output, and may only be written by an
operator after independently verifying both identities. There is no linking UI or
automatic data transfer. A billing mapping alone does not transfer legacy data.
Keep `CLERK_SECRET_KEY` in web and worker runtime environments only when using this
bridge. New accounts remain unpaid; there is no new-subscription checkout until
Lago integration. Billing-provider failures deny paid operations.

Workers need database access and their existing server credentials; they do not
accept a user ID from the browser. Chat owners are loaded from database joins,
and the paid check verifies that owner exists in Better Auth before execution.
Web actions retain their existing ownership filters, validation, token scopes,
and usage limits. Client entitlement checks are advisory only.

## Verification

`npm run auth:check` checks the session boundary with stubbed dependencies.
`node scripts/check-auth.mjs` checks public pages and signed-out redirects against
a running web service. `npm run auth:live` checks real signup, password login,
session revocation/expiry, protected routes, forbidden origins, and server-owned
fields against local Compose. It creates temporary users and removes only those
users afterward. Existing chat/action regression checks test cross-user rejection
with provider boundaries stubbed; they do not prove live paid agent execution.

Official references: [installation](https://www.better-auth.com/docs/installation),
[core schema and server-owned fields](https://www.better-auth.com/docs/concepts/database).

## UI verification

The shared sign-in/signup form uses existing Field, Input and Button components,
a responsive split layout, password visibility, native browser validation,
a 12–128-character signup policy, duplicate-submit protection, generic credential
errors, rate-limit feedback, and accessible loading/error states. Signup and login
navigate home; logout returns to sign-in. No nonfunctional OAuth or recovery
controls are shown. A successful browser signup, signin, and logout, incorrect
credential feedback, password visibility, and the 390px mobile layout were checked
locally on 2026-10-27 using disposable accounts, then the accounts were removed.

Security defaults retain CSRF/origin checks and HTTPS cookie behavior. The current
single web process uses in-memory rate limits; counters reset on restart. Before
running multiple replicas, choose shared rate-limit storage and configure only
trusted proxy IP headers. Mail verification/recovery requires a separately
configured delivery service and remains outside this rework.
