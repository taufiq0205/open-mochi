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

For OrbStack local builds, set `TRIGGER_PLATFORM_APP_ORIGIN=http://127.0.0.1:8030`
in `infra/trigger/.env`, then recreate `trigger-webapp`. The host network below
lets build-time indexing reach this loopback address; CLI 4.8.1 rewrites
`localhost` to a LAN address that cannot reach loopback-only published ports.

The web image does not contain or deploy tasks. CLI 4.8.1 local builds request
registry credentials from the server unless `TRIGGER_DOCKER_USERNAME` and
`TRIGGER_DOCKER_PASSWORD` are supplied. The server does not generate credentials
for this custom registry (`registry_not_supported`); use the scoped exports below. Authenticate a separate local CLI
profile against this instance, never the old Cloud project:

```sh
npx trigger.dev@4.8.1 login -a http://localhost:8030 --profile open-mochi
npx trigger.dev@4.8.1 whoami --profile open-mochi
docker login host.docker.internal:5050 --username registry-user
# One-time builder setup; Docker daemon registry settings do not configure BuildKit.
docker buildx create --name open-mochi-trigger --driver docker-container \
  --driver-opt network=host --buildkitd-config infra/trigger/buildkitd.toml
```

In the project's **Production environment variables**, configure `TRIGGER_PROJECT_REF`
with the same project ref as root `.env`, and `DATABASE_URL`
using the app's private `postgres:5432/mochi` database and its application password,
plus `DEEPSEEK_API_KEY` and `OPEN_SANDBOX_API_KEY`, `OPEN_SANDBOX_DOMAIN`, and `OPEN_SANDBOX_IMAGE` (see [sandbox setup](sandboxes.md)). Optional monitoring uses `SENTRY_DSN`.
Do not copy platform database credentials into worker settings. The supervisor
attaches run containers to `open-mochi_default` and its private control networks.
Ensure the application database schema was initialized first. The worker
`DATABASE_URL` must match the web service's resolved database URL, including the
application password; a placeholder password still allows deployment indexing
but makes chat and scheduled cleanup fail at runtime.

```sh
# Load root .env into the shell without printing it; project ref must be present.
set -a
. ./.env
set +a
# Scope registry credentials to the deployment process; do not copy them into root .env.
(
  set +a
  . ./infra/trigger/.env
  export TRIGGER_DOCKER_USERNAME="$TRIGGER_PLATFORM_DOCKER_REGISTRY_USERNAME"
  export TRIGGER_DOCKER_PASSWORD="$TRIGGER_PLATFORM_DOCKER_REGISTRY_PASSWORD"
  npx trigger.dev@4.8.1 deploy --env prod --profile open-mochi --skip-sync-env-vars --local-build --push --network host --builder open-mochi-trigger
)
# Apply the new environment key and rebuild the browser endpoint:
docker compose up -d --build web
```

Retries remain three attempts with exponential backoff; task max duration remains
one hour. The supervisor removes exited run containers. The OpenSandbox migration adds a minute-by-minute idle pause task; confirm it
is active after deploying. OpenSandbox itself enforces retention expiry. Removing run containers does not delete bot sandboxes.

## URLs and validation

- The platform advertises `API_ORIGIN` using `TRIGGER_PLATFORM_APP_ORIGIN` (locally
  `http://localhost:8030`), so the host CLI can resolve project/deployment URLs.
  Do not advertise the container-only `trigger-webapp` hostname here.
- Deployed workers use `INTERNAL_API_ORIGIN=http://trigger-webapp:3000` with
  `INTERNAL_API_ORIGIN_ENABLED=1`, and `STREAM_ORIGIN=http://trigger-webapp:3000`.
  Their loopback address belongs to the worker container, so the public host URL
  cannot serve worker API/session-stream requests. These are platform settings;
  `TRIGGER_API_URL` is reserved and cannot be set as a project worker variable.
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
bounded per-member handoffs, transcript persistence, worker restart/retry, denied cross-user
access, and sandbox cleanup against real providers. A healthy platform alone does
not prove these paths. Keep all platform volumes in backups; test recovery before
production use. Source-map upload is opt-in with SENTRY_AUTH_TOKEN, SENTRY_ORG and
SENTRY_PROJECT in the deployment shell.

Deploy `trigger/sandboxes.ts` with the worker to register `pause-idle-opensandboxes`
(every minute). Confirm activation in the self-hosted Production environment;
source files alone do not activate a schedule. Without it, native 24-hour expiry
still applies, but running sandboxes do not pause when idle. Workers must use a
reachable OpenSandbox URL and the matching server key for this installation.

Group recall checks the current bot's saved context, then consults unvisited group
members when it is missing. Each member can receive the turn once and has one
cached memory read per turn. The model is instructed to consult peers for missing context and to skip
lookup for greetings and general questions. Tool results are explicitly
retained for the active bot to avoid Trigger 4.8.1 / AI SDK 7 history-retention
loss. The existing 20-step limit still bounds a turn, including large groups.
