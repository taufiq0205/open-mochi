# Better Auth

Email/password authentication runs inside the Next.js web service, using Drizzle
and the existing PostgreSQL volume. No separate auth container or Clerk login key
is required. Set a stable random `BETTER_AUTH_SECRET` (at least 32 characters) and
`BETTER_AUTH_URL` to the exact browser-facing origin, including the port. Use HTTPS
for remote hosting. Never build the signing secret into the image.

Run the documented `docker compose run --rm --build db-tools` schema push before
starting the web image. Fresh setup creates `auth_user`, `auth_session`, `auth_account`, and
`auth_verification`. Existing installations may be offered removal of legacy
billing/usage tables and columns; back up and explicitly review destructive proposals.
No live database cleanup was performed by the source removal. Back up the full database, including auth tables.

Sign up at `/sign-up`, sign in at `/sign-in`, and sign out from the sidebar.
Passwords require 12–128 characters. Better Auth handles password hashing, session
expiry/revocation, secure cookies, origin checks, and rate limiting (enabled in development and production).
Sessions are validated against PostgreSQL; cookie session caching is disabled.
The Next.js `nextCookies` plugin forwards cookie updates from server actions.
Authenticated visitors to sign-in/signup are redirected home. Identity-only
queries and actions use `requireSession`. There are no paid gates or entitlement lookups.
Email/password registration does not verify mailbox ownership. Email delivery,
password recovery, OAuth, and MFA are not configured in this migration.

## Ownership

Application ownership uses the Better Auth user's immutable `id` everywhere,
including worker-side sandbox checks. Signup accepts no ownership ID. Legacy
users, passwords, sessions, bots, and chats are **not automatically migrated or linked by email**.
Existing application rows keep their original owner IDs and remain inaccessible
to new accounts. Do not relabel owners without a reviewed identity migration.

Workers need database access and their existing server credentials. Chat owners
are loaded from database joins with `auth_user`; browser-supplied ownership IDs
are not accepted. Web actions retain ownership filters, validation and token
scopes. Signed-in users have feature access without billing or usage checks.

## Verification

`npm run auth:check` checks the session boundary with stubbed dependencies.
`node scripts/check-auth.mjs` checks public pages and signed-out redirects against
a running web service. `npm run auth:live` checks real signup, password login,
session revocation/expiry, protected routes, forbidden origins, and immutable
identity against local Compose. It creates temporary users and removes only those
users afterward. Existing chat/action regression checks test cross-user rejection
with provider boundaries stubbed; they do not prove live agent execution.

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
