# Self-hosted Trigger.dev

The platform, supervisor, CLI, SDK and build package use **4.8.1**. Compose is
adapted from [upstream v4.8.1](https://github.com/triggerdotdev/trigger.dev/tree/bd2a14e6ad83fbe056a473b0082ff4110747fa38/hosting/docker)
under Apache-2.0. ClickHouse XML files retain upstream configuration. See the
[official setup](https://trigger.dev/docs/self-hosting/docker).

Allow at least 7 CPU / 14 GB RAM for platform and workers, plus the application.
OrbStack supplies Docker on macOS. Worker runs are separate containers, created
by the supervisor through a private Docker socket proxy; this grants container
management privileges. Only trusted operators should access the platform.

## First setup

Copy `.env.example` to `.env` at the root and configure the app as in README.
Create separate platform secrets (never reuse the application database password):

```sh
cp infra/trigger/.env.example infra/trigger/.env
chmod 600 infra/trigger/.env
# Fill every blank secret with a separate `openssl rand -hex 16` value.
# Set TRIGGER_PLATFORM_WHITELISTED_EMAILS to an anchored operator email regex.
```

Generate `infra/trigger/registry/auth.htpasswd` using bcrypt for `registry-user`,
with the same password as `TRIGGER_PLATFORM_DOCKER_REGISTRY_PASSWORD`.
For example, this prompts interactively without placing the password in history:

```sh
mkdir -p infra/trigger/registry
docker run --rm -it --entrypoint htpasswd httpd:2-alpine -nB registry-user
# Save its single registry-user:... output line to the ignored auth.htpasswd file.
chmod 600 infra/trigger/registry/auth.htpasswd
```

The local registry is loopback port **5050**. Docker must allow the insecure HTTP
registry `host.docker.internal:5050` (OrbStack Docker settings); use TLS for remote
installations. That address must resolve from the host and Docker engine. Override
`TRIGGER_PLATFORM_DOCKER_REGISTRY_URL` for Linux hosts with an appropriate reachable
registry address. Never expose the socket proxy or database ports.

```sh
docker compose up -d --wait
```

The root Compose file includes the platform with a separate environment file and
namespaced variables. App PostgreSQL and Trigger PostgreSQL have distinct volumes
and credentials. Registry images, MinIO packets/transcripts, Redis AOF, ClickHouse,
S2 streams and bootstrap worker token all have named volumes. `down` preserves
them; never use `down -v` without a reviewed backup.

Open http://localhost:8030, sign in with your allowed email, and obtain the magic
link from local `trigger-webapp` logs (no email service by default). Create an
organization and project. Copy its project ref and **Production** environment key
to root `.env` as `TRIGGER_PROJECT_REF` and `TRIGGER_SECRET_KEY`. This is a new
instance: Cloud sessions/transcripts, credentials and schedules are not migrated.

## Deploy the worker

The web image does not contain or deploy tasks. Authenticate a separate local CLI
profile against this instance, never the old Cloud project:

```sh
npx trigger.dev@4.8.1 login -a http://localhost:8030 --profile open-mochi
npx trigger.dev@4.8.1 whoami --profile open-mochi
docker login host.docker.internal:5050 --username registry-user
```

In the project's **Production environment variables**, configure `DATABASE_URL`
using the app's private `postgres:5432/mochi` database and its application password,
plus `DEEPSEEK_API_KEY` and `DAYTONA_API_KEY`. Optional monitoring uses `SENTRY_DSN`.
Do not copy platform database credentials into worker settings. The supervisor
attaches run containers to `open-mochi_default` and its private control networks.
Ensure the application database schema was initialized first.

```sh
# Load root .env into the shell without printing it; project ref must be present.
set -a
. ./.env
set +a
npx trigger.dev@4.8.1 deploy --env prod --profile open-mochi --skip-sync-env-vars
# Apply the new environment key and rebuild the browser endpoint:
docker compose up -d --build web
```

Retries remain three attempts with exponential backoff; task max duration remains
one hour. The supervisor removes exited run containers. There are no application
schedules after billing removal; no replacement schedules are introduced.
Sandbox failure cleanup and native idle/retention settings remain in the existing
Daytona integration. Removing run containers does not delete bot sandboxes.

## URLs and validation

- Server actions use `http://trigger-webapp:3000` inside Compose; host processes use
  root `TRIGGER_API_URL=http://localhost:8030`.
- Browser transport uses `NEXT_PUBLIC_TRIGGER_API_URL=http://localhost:8030`, baked
  at build time. Remote installs need a browser-reachable HTTPS URL and a rebuild.
  Configure Trigger APP/LOGIN origins, API routing, CORS and SSE proxy timeouts for
  that deployment; do not publish container-only hostnames to browsers.
- Session start, transcript reads and token minting retain login/ownership checks.
  Browser tokens are scoped to one chat for one hour; secret keys stay server-side.

```sh
npm run trigger:check
node scripts/check-ai-chat.mjs
docker compose ps
```

After provisioning, verify direct and group turns, streaming/reconnect, tool calls,
one-turn handoffs, transcript persistence, worker restart/retry, denied cross-user
access, and sandbox cleanup against real providers. A healthy platform alone does
not prove these paths. Keep all platform volumes in backups; test recovery before
production use. Source-map upload is opt-in with SENTRY_AUTH_TOKEN, SENTRY_ORG and
SENTRY_PROJECT in the deployment shell.
