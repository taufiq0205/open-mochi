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
# Fill in your own provider credentials, then:
docker compose up -d --build
```

Open http://localhost:3000. Set `WEB_PORT` in `.env` to change the host port.
The port binds to loopback; configure a TLS reverse proxy before remote access.
The Node.js 24 runtime runs as a non-root user. Compose supplies a private service
network and a named `next-cache` volume for the Next.js cache. User data still lives
in the external database and sandbox provider. `docker compose down` retains volumes;
do not use `down -v` unless you intend to delete them.

Required external services in this phase:

- **Clerk**: publishable and secret keys from the same instance; configure localhost
  login/redirect origins and the existing `pro` subscription plan for paid features.
- **Neon PostgreSQL**: pooled `DATABASE_URL`, direct `DATABASE_URL_UNPOOLED`.
  Initialize a new development database using Node.js 24: `npm ci && npm run db:push`.
  Review schema changes before applying them to existing data. Keep database backups.
- **Trigger.dev Cloud**: `TRIGGER_SECRET_KEY` and a separately deployed worker.
  Replace the reference project ID in `trigger.config.ts` with your own. Deploy with
  `npx trigger.dev@4.8.1 deploy`; configure `DATABASE_URL`, `CLERK_SECRET_KEY`,
  `DEEPSEEK_API_KEY`, and `DAYTONA_API_KEY` in that worker environment too.
  Compose starts only the web server; it does not deploy or run a worker.
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
