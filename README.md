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
# Set POSTGRES_PASSWORD (openssl rand -hex 32) and provider credentials.
# Initialize a fresh database first; review any proposed changes:
docker compose up -d --wait postgres
docker compose run --rm db-tools
docker compose up -d --build
```

Open http://localhost:3000. Set `WEB_PORT` in `.env` to change the host port.
The port binds to loopback; configure a TLS reverse proxy before remote access.
The Node.js 24 runtime runs as a non-root user. Compose supplies a private service
network and a named `next-cache` volume for the Next.js cache. PostgreSQL data lives in the named `postgres-data` volume; sandbox data remains
with the external sandbox provider. `docker compose down` retains volumes;
do not use `down -v` unless you intend to delete them.

Required external services in this phase:

- **Clerk**: publishable and secret keys from the same instance; configure localhost
  login/redirect origins and the existing `pro` subscription plan for paid features.
- **Trigger.dev Cloud**: `TRIGGER_SECRET_KEY` and a separately deployed worker.
  Replace the reference project ID in `trigger.config.ts` with your own. Deploy with
  `npx trigger.dev@4.8.1 deploy`; configure `DATABASE_URL`, `CLERK_SECRET_KEY`,
  `DEEPSEEK_API_KEY`, and `DAYTONA_API_KEY` in that worker environment too.
  Compose starts web and PostgreSQL; it does not deploy or run a worker.
  Cloud workers cannot reach the private Compose database. Agent execution requires
  a worker with secure network access to this database; never publish it openly.
- **DeepSeek** and **Daytona**: API keys, provider credits, sandbox access and quotas.
- **Sentry** (optional): your own `SENTRY_DSN` and `NEXT_PUBLIC_SENTRY_DSN`.
  Blank DSNs disable event delivery. Source-map uploads are not configured in Docker;
  update reference organization/project settings before enabling uploads elsewhere.

Keep secrets in ignored `.env`. Only the public Clerk key and optional public Sentry
DSN are build arguments; changing them requires rebuilding the image. Server secrets
are runtime environment values and are excluded from the build context.

## Checks

```sh
npm run typecheck
npm run lint
npm run bot:check
npm run deployment:check
docker compose ps
docker compose logs --tail=100 web
curl --fail http://localhost:3000/healthz
node scripts/check-auth.mjs
```

`/healthz` checks the web process only; it does not check authentication, database,
workers, billing, inference, or sandboxes. Real sign-in and cross-user authorization,
chat/tool execution, desktop access, billing and telemetry require separate live checks.

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
docker compose run --rm db-tools node scripts/check-usage.mjs --live
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
