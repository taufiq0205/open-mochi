# open-mochi

Self-hostable Mochi migration. Application source is copied from `reference/mochi/`;
the original checkout is preserved and ignored. See [migration status](docs/plan.md).

Based on [Mochi](https://github.com/taufiq0205/mochi), the primary project reference.

## Docker foundation

Requires Docker Engine with Compose (OrbStack on macOS), internet access for npm
and Google Fonts during build, and your own external provider accounts. No local
GPU or model download is required in this phase; inference remains external.

```sh
cp .env.example .env
# Complete the platform secret/registry setup in docs/trigger.md first.
# Set POSTGRES_PASSWORD, BETTER_AUTH_SECRET and OPEN_SANDBOX_API_KEY
# (separate openssl rand -hex 32 values).
# Set BETTER_AUTH_URL to the browser-facing origin and provider credentials.
# Initialize a fresh database first; review any proposed changes:
docker compose up -d --wait postgres
docker compose run --rm db-tools
docker compose up -d --build
```

Open http://localhost:3000. Set `WEB_PORT` and matching `BETTER_AUTH_URL` in `.env` to change the host port.
The port binds to loopback; configure a TLS reverse proxy before remote access.
The Node.js 24 runtime runs as a non-root user. Compose supplies a private service
network and a named `next-cache` volume for the Next.js cache. PostgreSQL data lives in the named `postgres-data` volume; sandbox data remains
in OpenSandbox-managed Docker containers. `docker compose down` retains volumes;
do not use `down -v` unless you intend to delete them.

Agent platform and external services:

- **Self-hosted Trigger.dev**: follow [platform and worker setup](docs/trigger.md)
  before startup. Compose runs the platform; worker deployment is a separate step.
- **DeepSeek**: API key and provider credits.
- **OpenSandbox**: follow [sandbox host and desktop setup](docs/sandboxes.md).
  Compose runs its Docker backend and builds the ARM64-compatible desktop image; no KVM is needed.
- **Sentry** (optional): your own `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`.
  Blank DSNs disable event delivery. Source-map uploads are not configured in Docker;
  update reference organization/project settings before enabling uploads elsewhere.

Keep secrets in ignored `.env`. Only the optional public Sentry
DSN is a build argument; changing it requires rebuilding the image. Server secrets
are runtime environment values and are excluded from the build context.

Authentication is local Better Auth; see [auth setup](docs/auth.md). All signed-in
users can use bots, chats, and sandboxes. There are no subscriptions, payment
providers, billing events, usage ledgers, or per-user allowances. Operators pay
external providers directly. A deployed minute-by-minute worker task pauses sandboxes idle for five minutes.
OpenSandbox natively expires state 24 hours after the last tool/desktop connection.
Desktop tickets last five minutes;
reconnect when they expire. No application resource accounting or allowances are added.

Existing installations: the schema no longer declares `usage_periods`,
`usage_ledger`, or `auth_user.clerk_user_id`. No database changes are automatic.
Back up and explicitly review any schema push that proposes dropping them;
existing unused tables/columns can remain until an approved cleanup. Remove any
obsolete Clerk secret from your ignored environment and redeploy workers to
remove old billing checks and usage schedules.

## Checks

```sh
npm run typecheck
npm run lint
npm run bot:check
npm run sandbox:check
npm run deployment:check
docker compose ps
docker compose logs --tail=100 web
curl --fail http://localhost:3000/healthz
node scripts/check-auth.mjs
```

`/healthz` checks the web process only; it does not check authentication, database,
workers, inference, or sandboxes. Real sign-in and cross-user authorization,
chat/tool execution, desktop access and telemetry require separate live checks.

The container uses [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).
Later service replacements belong on the branches assigned in [docs/plan.md](docs/plan.md).

## PostgreSQL operations

Drizzle and `pg` are retained; both application and schema tools use `DATABASE_URL`.
Compose supplies a direct local connection. Outside Compose, set a reachable URL;
TLS and credentials must match that server. `DATABASE_URL_UNPOOLED` is no longer used.
PostgreSQL credentials initialize an empty volume only; changing `.env` does not
rotate an existing database password. Use a URL-safe password as shown above.
Schema push is an explicit setup step, never automatic at web startup. Do not
approve destructive changes without a reviewed backup. Existing Neon data is not
copied automatically; export and rehearse restoration separately before cutover.

```sh
docker compose run --rm db-tools npm run db:check
```

Create a backup outside the repository (contains private application data):

```sh
umask 077
docker compose exec -T postgres pg_dump -U mochi -d mochi -Fc > /absolute/private/path/mochi.dump
```

Rehearse restore into a **new, empty** database, preserving the source:

```sh
docker compose exec -T postgres createdb -U mochi mochi_restore_check
docker compose exec -T postgres pg_restore -U mochi -d mochi_restore_check --exit-on-error --no-owner < /absolute/private/path/mochi.dump
docker compose exec -T postgres psql -U mochi -d mochi_restore_check -c '\dt'
```

Use a new database name for each rehearsal. Restoring over existing data, dropping
rehearsal databases, and deleting volumes require a separate deliberate decision.
Keep backups off-host and test restores regularly. Major PostgreSQL upgrades need
an explicit upgrade procedure; do not simply change the image major version.
The volume layout follows the [official PostgreSQL 18 image](https://hub.docker.com/_/postgres).

## Future work

- **assistant-ui UI upgrade**: evaluate [assistant-ui](https://www.assistant-ui.com/)
  for richer chat interactions, grouped tool activity, approvals, and multi-agent
  displays while retaining Vercel AI SDK. Validate compatibility with the
  self-hosted Trigger.dev chat transport before migration. Planned; not implemented.
