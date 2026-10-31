# open-mochi

An open-source, self-hosted alternative to my project
[Mochi](https://github.com/taufiq0205/mochi), with individual and group chats,
persistent bot memory, sandbox tools, and browser-accessible Linux desktops.

Runs locally with Docker Compose: Next.js, Better Auth, PostgreSQL, self-hosted
Trigger.dev, and OpenSandbox. Chat uses the DeepSeek API; Sentry is optional.
There are no subscriptions or usage allowances in the application. You pay any
external provider costs directly.

## Requirements

- Docker with Compose (OrbStack on macOS), with at least **7 CPUs and 14 GB RAM**
  free for Trigger and its workers, plus room for the app and sandboxes.
- Node.js **24** and npm.
- A DeepSeek API key with credits. No GPU is needed.

These steps target local OrbStack. For Linux or a remote host, see
[Trigger setup](docs/trigger.md) and [sandbox setup](docs/sandboxes.md).

## Setup

1. **Configure the app.**

   ```sh
   git clone https://github.com/taufiq0205/open-mochi.git
   cd open-mochi
   cp .env.example .env && chmod 600 .env
   ```

   In `.env`, set `POSTGRES_PASSWORD`, `BETTER_AUTH_SECRET` and
   `OPEN_SANDBOX_API_KEY` to separate `openssl rand -hex 32` values, and set
   `DEEPSEEK_API_KEY`. Keep the other defaults and keep these secrets stable.

2. **Configure Trigger.** Follow [Trigger first setup](docs/trigger.md#first-setup)
   to create `infra/trigger/.env`, the registry password file, and the Docker HTTP
   registry setting.

3. **Create the database and start the stack.**

   ```sh
   docker compose up -d --wait postgres
   docker compose run --rm db-tools
   docker compose up -d --build --wait
   ```

4. **Create the Trigger project.** Open http://localhost:8030 and sign in with
   your allowed email. The sign-in link is in `docker compose logs trigger-webapp`.
   Create an organization and project, then copy its project ref and
   **Production** key into `.env` as `TRIGGER_PROJECT_REF` and `TRIGGER_SECRET_KEY`.

5. **Deploy the chat worker.** Follow [Deploy the worker](docs/trigger.md#deploy-the-worker).
   It also covers the worker's own environment variables, since `.env` is not
   copied to the worker. Then rebuild the web app:

   ```sh
   docker compose up -d --build --wait web
   ```

6. **Try it.** Open http://localhost:3000, create an account and a bot, and start
   a chat. Check that the `pause-idle-opensandboxes` schedule is active in Trigger.

Schema changes never run at startup. Back up an existing database before running
`db-tools` and review any schema deletion it proposes.

## Everyday use

```sh
docker compose up -d --build   # start or rebuild
docker compose ps              # check health
docker compose stop            # stop and keep data
```

After changing code under `trigger/` or code it imports, redeploy the worker
(step 5). Rebuilding the web image does not update the worker.

If chat stalls, check the logs and the worker's Production variables:

```sh
docker compose logs --tail=100 web trigger-webapp
```

`curl http://localhost:3000/healthz` checks only the web process.

## Architecture

![open-mochi architecture: setup, chat execution, batched desktop actions, and desktop access](docs/project-architecture.png)

[Open SVG](docs/project-architecture.svg) ·
[Edit in Excalidraw](docs/project-architecture.excalidraw)

- Direct chats have sandbox tools and memory; groups use memory and handoffs,
  consulting each member at most once per turn.
- Desktop access checks ownership and uses a five-minute relay ticket. The
  OpenSandbox API key stays server-side.
- A scheduled check runs every minute and pauses sandboxes five minutes after
  their last tool/desktop connection. Activity inside an already-open desktop
  does not refresh that deadline; reconnect as needed.
- Native sandbox expiry is 24 hours after the last tool/desktop connection.
  Memory survives pause/resume but is deleted with its sandbox on expiry/deletion.

## Data and remote access

Compose keeps service data in named volumes. Bot files and `MEMORY.md` live in
OpenSandbox-managed containers; a PostgreSQL backup alone does not include them.
Do not run `docker compose down -v` unless you intend to delete service data.
See [sandbox storage](docs/sandboxes.md#isolation-and-storage) for bot data details.

Ports bind to localhost. Before remote use, configure a TLS reverse proxy,
browser-reachable application/Trigger/desktop URLs, and WebSocket support.
Rebuild the web image after changing its public Trigger or Sentry configuration.
Keep Docker control endpoints, databases, and server secrets private.

## Further reading

- [Trigger platform, registry, worker deployment, and networking](docs/trigger.md)
- [Sandbox configuration, isolation, lifecycle, and checks](docs/sandboxes.md)
- [Authentication setup](docs/auth.md)
- [Migration status and verification limits](docs/plan.md)

Future work: evaluate assistant-ui for richer chat interactions while retaining
AI SDK and compatibility with the self-hosted Trigger transport.
