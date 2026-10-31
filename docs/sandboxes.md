# OpenSandbox

OpenSandbox 1.2.0 replaces the uncommitted E2B integration. Root Compose runs its
Docker backend and builds `open-mochi-sandbox:local`, an ARM64-compatible Debian
XFCE/Firefox desktop. KVM is not required. The existing branch name
`migration/sandboxes-e2b` is retained; its target is now OpenSandbox.

## Setup

Set independent random `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` and
`OPEN_SANDBOX_API_KEY` values in ignored root `.env` (`openssl rand -hex 32`).
Complete the existing database and Trigger setup, then run:

```sh
docker compose up -d --build
```

Compose builds the desktop image through a one-shot `sandbox-image` service,
starts the authenticated server on loopback port 8085, and starts web plus the
browser desktop relay. Runtime images are pinned to `release-1.2.0`; the SDK is
pinned to 1.2.0. No third-party sandbox account is required.

Web and Docker-hosted workers use `OPEN_SANDBOX_DOMAIN=http://host.docker.internal:8085`.
Host scripts use `http://localhost:8085`. Configure `OPEN_SANDBOX_API_KEY`,
`OPEN_SANDBOX_DOMAIN` and `OPEN_SANDBOX_IMAGE=open-mochi-sandbox:local` in deployed
Trigger workers too. Remote workers need a reachable TLS-protected server URL.
API keys remain server-only. Keep the Docker lifecycle API private.

`DESKTOP_PROXY_URL=ws://localhost:3001` is browser-facing. Remote installs need a
TLS reverse proxy with WebSocket upgrades and a `wss://` URL. Web and relay must
share `BETTER_AUTH_SECRET` and `BETTER_AUTH_URL`; preserve the browser Origin.
Never log relay query strings, which contain five-minute bearer tickets.

## Isolation and storage

The OpenSandbox server controls the Docker daemon through its socket. Treat it
as privileged infrastructure and protect its key. It runs on Docker's default
bridge, separately from application database/control networks. Sandboxes use the
upstream egress sidecar in `dns+nft` mode; private, link-local, reserved and shared-address
ranges are denied to block lateral access to host services and other sandboxes.
IPv6 is disabled. Do not disable the egress sidecar to work around a startup error.

Each bot has a separate container with CPU, memory and PID limits. Shell, GUI and
filesystem tools run as UID/GID 1000. The desktop uses Xvfb, x11vnc with a random
per-sandbox password, and websockify. Native VNC binds only the sandbox loopback.
The browser uses an ownership-authorized, encrypted, port-scoped relay ticket;
the OpenSandbox API key is injected only on the server-to-server connection.

Docker containers share the OrbStack Linux kernel. They do not provide microVM
isolation for hostile multi-tenant workloads. The sidecar needs NET_ADMIN for its
own firewall; sandbox workloads retain dropped capabilities/no-new-privileges.

Sandbox files, including `/home/desktop/MEMORY.md`, persist in each container's
writable layer across pause/resume. Pause freezes processes; it does not reclaim
their RAM as a microVM snapshot would. The `opensandbox-state` named volume retains
server metadata, expiry and SQLite state. Preserve it and the managed sandbox
containers; backing up application PostgreSQL alone does not back up bot files.

New bots initialize blank memory and pause before saving their bot/chat relationship.
Failures attempt compensating deletion. If compensation also fails, the operator
must remove that orphan through OpenSandbox; it has no committed bot row to sweep.
IDs use `osb:` so legacy Daytona/E2B IDs cannot accidentally target OpenSandbox.
Legacy data is untouched and requires an explicit transfer/cleanup.

## Lifecycle

Owned tool/desktop connections renew native expiry to 24 hours from access and
resume paused containers under a bot row lock. Expiry deletes the sandbox and its
files, including when paused; it is independent of Trigger worker availability.
Deletion failures roll back bot deletion; missing provider resources are tolerated.
No schema change, billing or application resource ledger is introduced.

Docker mode has no native idle auto-pause. Deploy `trigger/sandboxes.ts` and confirm
`pause-idle-opensandboxes` is active every minute. It pauses containers five minutes
after the last tool/desktop connection, using the native expiry timestamp to derive
last access. Resume and idle pause share a row lock. Desktop activity/background
processes do not renew this deadline automatically; reconnect as needed. Without
the worker schedule, idle sandboxes keep running until their native expiry.

## Local verification (2026-10-30)

ARM64 image builds and healthy Compose startup passed on OrbStack. Real disposable
sandboxes passed API authentication, UID 1000 shell, command timeout, application
memory/GUI tools, pause/resume persistence, inspected PNG output, host/private egress
denial, password-authenticated VNC through the relay, and paused native expiry.
Local auth and cross-user denial checks passed. Disposable fixtures were removed.
Worker schedule activation, browser interaction, full agent turns, daemon restart
and backup/restore remain unverified.

## Checks

```sh
npm run typecheck
npm run bot:check
npm run sandbox:check
npm run trigger:check
npm run sandbox:live
```

`sandbox:check` stubs provider boundaries and tests the real relay over loopback.
`sandbox:live` creates a disposable real sandbox on the configured server, checks
shell/files, pause/resume, screenshots, blocked private egress, authenticated VNC
through the relay, and paused native expiry; it deletes its own fixture afterward.
A screenshot is saved only to `/tmp/open-mochi-opensandbox-desktop.png`.

Use `SANDBOX_LIVE_DOMAIN` to override the live test's default localhost URL. Live
checks allocate local Docker resources. They do not prove deployed Trigger turns,
model/tool execution, browser interaction, worker restart behavior or production.

References: [OpenSandbox](https://github.com/opensandbox-group/OpenSandbox),
[Docker configuration](https://github.com/opensandbox-group/OpenSandbox/blob/main/server/configuration.md),
[desktop example](https://github.com/opensandbox-group/OpenSandbox/tree/main/examples/desktop),
[egress policy](https://github.com/opensandbox-group/OpenSandbox/blob/main/docs/architecture/network/egress.md).

## Batched desktop actions

Direct-chat agents can use `desktopActions` for 1–10 sequential mouse, keyboard,
scroll or short wait actions in one model tool call. The tool returns a screenshot
at the end; `showInChat: true` also displays it to the user. Agents inspect the
screen first and end each batch before a new visual decision is needed. Existing
single-action tools remain available; group chats still use only memory/handoffs.

Batches share one sandbox connection and cannot interleave with other calls in
the same tool set. Cancellation is checked between actions. Execution stops on
failure, but completed actions are not rolled back. Each wait is capped at three
seconds. The 20-model-step turn limit remains in place; batching reduces the
round trips needed for known action sequences.
