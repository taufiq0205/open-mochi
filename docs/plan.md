# open-mochi migration plan

## Goal and current state

Deliver a self-hostable AI agent workspace that starts, after documented configuration, with:

```sh
docker compose up -d --build
```

Preserve Mochi's individual and group chats, bot instructions and avatars, agent tool execution, sandbox memory, browser desktop access, authorization, and usage controls.

As of 2026-10-26:

- The root repository is initialized on `main` and connected to `https://github.com/taufiq0205/open-mochi.git`.
- Original source is preserved at `reference/mochi/`, ignored by the root repository. Fresh clones require this reference to be supplied separately.
- Eight local migration branches exist, all initially based on the same bootstrap commit. They contain no migration implementation and have not been pushed.
- OrbStack Docker connectivity was verified with Docker 29.8.2 and Compose v5.5.0. No application image or stack has been built or tested.
- The root contains documentation only; the application, Dockerfile, and Compose configuration remain to be implemented.

## Stack and branch mapping

| Branch | Current service | Target | Required scope |
| --- | --- | --- | --- |
| `migration/deployment-docker-compose` | Vercel-oriented Next.js deployment | Docker Compose | Establish the root application, Node.js 24 image, configuration examples, service networking, health checks, and persistent volumes. |
| `migration/database-postgresql` | Neon PostgreSQL | PostgreSQL | Retain Drizzle and `pg`; replace provider-specific setup, configure local connections, and document schema initialization and backups. |
| `migration/auth-better-auth` | Clerk authentication | Better Auth | Replace login UI, sessions, server actions, worker identity checks, and ownership integration. |
| `migration/billing-lago` | Clerk Billing and Pro checks | Lago | Implement subscription state and entitlement checks, billing events, usage integration, and payment-provider configuration. |
| `migration/agents-trigger-self-hosted` | Trigger.dev Cloud | Self-hosted Trigger.dev | Configure platform dependencies, worker builds and deployment, scoped session tokens, streaming, retries, schedules, and sandbox cleanup. |
| `migration/inference-ollama` | DeepSeek API | Ollama with a suitable model | Retain AI SDK; adapt provider configuration and verify streaming, tool calls, group handoffs, and usage accounting. |
| `migration/sandboxes-e2b` | Daytona | E2B Runtime and Desktop | Replace provisioning, shell and file tools, desktop credentials, memory storage, expiry, cleanup, and resource accounting. |
| `migration/monitoring-glitchtip` | Sentry backend | GlitchTip | Adapt DSNs and build setup; verify supported SDK events, source maps, and worker monitoring. |

Keep Next.js, React, TypeScript, Tailwind, shadcn/ui, Base UI, React Hook Form, Zod, Drizzle, and AI SDK. Retain noVNC only where compatible with the selected desktop integration. Treat target services as candidates until their integration checks pass.

## Implementation sequence

1. **Application and Docker foundation:** inspect the reference and copy only required application source into the root, excluding its nested Git repository, secrets, dependencies, and generated output. Establish a working build and Compose entry point. External services may remain temporarily; document them explicitly.
2. **Database:** establish PostgreSQL and schema initialization before integrating authentication and billing storage. Use Drizzle push for this development migration; review destructive changes before applying them.
3. **Identity and billing:** implement Better Auth first, then replace Clerk subscription checks in both web and worker paths. Define trusted user identity and entitlement contracts before integrating dependent branches.
4. **Agent platform and inference:** bring up self-hosted Trigger.dev and its workers; integrate Ollama and a tested tool-capable model. Preserve scoped access and group handoff behavior.
5. **Sandbox and desktop:** integrate E2B and verify its host requirements, persistent bot memory lifecycle, isolated execution, desktop access, and cleanup.
6. **Monitoring and final Compose integration:** wire supported telemetry, remove obsolete provider requirements, and verify startup from a clean documented setup.

Implement each service on its named branch when authorized. Integrate completed changes sequentially into `main`; dependent branches must receive the established foundation before implementation. Resolve shared identity, configuration, and Compose changes at integration time. Branch preparation alone does not authorize switching, merging, or pushing.

## Completion checks

- [ ] Root application builds with existing open-source libraries retained.
- [ ] One Compose command builds and starts the documented service set after configuration, including required worker deployment/bootstrap steps.
- [ ] PostgreSQL readiness, schema initialization, persistence across restarts, and backup/restore are checked.
- [ ] Sign-up, sign-in, sign-out, expired sessions, and cross-user access denial work.
- [ ] Subscription changes and billing events update web and worker entitlements safely; duplicate events are handled.
- [ ] Individual and group chats stream; tool calls, handoffs, retries, and worker restarts behave correctly.
- [ ] Sandbox shell/files, bot memory, desktop authentication, user isolation, expiry, and cleanup are verified.
- [ ] Usage limits reject work consistently before expensive provider operations.
- [ ] Web and worker errors reach monitoring with useful stack traces and without chat content, tool payloads, secrets, or signed URLs.
- [ ] Fresh setup instructions list required accounts, hardware, model downloads, ports, credentials, and any remaining external services.

## Constraints and open decisions

- One command means multiple coordinated services; not a single container. Configuration, model downloads, and payment-provider setup may precede startup.
- OrbStack availability does not prove E2B compatibility. Verify CPU architecture, Linux/KVM requirements, and nested virtualization; a separate Linux sandbox host may be necessary.
- Ollama's runtime and model licenses are separate. Select a model by hardware capacity and actual agent/tool performance.
- Lago replaces billing infrastructure, not payment networks. Verify community-edition features and license obligations before adopting it.
- GlitchTip compatibility with Sentry SDKs does not guarantee parity for every logging, tracing, or source-map feature currently used.
- Self-hosted Trigger.dev chat APIs and SDK versions must be verified together; existing cloud workers are not automatically launched by the web image.
- Hindsight memory and a visual workflow builder remain outside this migration scope; the reference lists them as future work.

## Progress recording

All migration layers are currently **planned; branches prepared**. For each completed layer, record the commit, checks performed, remaining external dependencies, and unverified behavior here. Mark the overall migration complete only after the integrated Compose acceptance checks pass.
