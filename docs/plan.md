# open-mochi migration plan

## Goal and current state

Deliver a self-hostable AI agent workspace that starts, after documented configuration, with:

```sh
docker compose up -d --build
```

Preserve Mochi's individual and group chats, bot instructions and avatars, agent tool execution, sandbox memory, browser desktop access, authorization, and usage controls.

As of 2026-10-27:

- Deployment foundation is implemented and locally verified on `migration/deployment-docker-compose`; integration and remote delivery are tracked in Git history.
- Application source was copied into the root from reference commit `82c4cf0d8ad087400ec44cbf4b19afcd25ac9c67`; `reference/mochi/` remains untouched and ignored. Nested Git metadata, agent configuration, secrets, dependencies, and generated output were excluded.
- This branch originally predates the plan and instructions; `AGENTS.md` and this plan were restored from `main` before implementation.
- A Node.js 24 multi-stage image, standalone Next.js output, Compose web service, `/healthz`, named cache volume, and configuration/setup documentation are implemented.
- Vercel's pool lifecycle hook was removed for the long-running Node server. Reference Sentry DSNs were replaced with optional environment configuration, preserving telemetry filtering.
- OrbStack context `orbstack`, Docker 29.8.2, Compose v5.5.0, and ARM64 daemon connectivity were verified. The production image builds and the Compose web container becomes healthy with placeholder credentials.
- Database migration is implemented on `migration/database-postgresql`: local PostgreSQL replaces Neon configuration; verification is recorded below. Better Auth is implemented locally on `migration/auth-better-auth`; Clerk Billing, Trigger.dev Cloud, DeepSeek, Daytona, and optional Sentry remain external. No production deployment is claimed.

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
| `revamp/bot-chat-ui` | Existing bot creation and chat interface | Revamped bot and chat UI | Redesign bot creation/editing, individual and group chat layouts, sidebar/navigation, composer, tool-call/results display, and thinking/reasoning states. Reuse existing UI libraries; preserve streaming, handoffs, desktop access, validation, ownership, and usage controls. Verify responsive layouts, keyboard accessibility, and loading/error/empty states. Implemented locally; verification and remaining live checks are recorded below. |

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

- [x] Root application builds with existing open-source libraries retained.
- [ ] One Compose command builds and starts the documented service set after configuration, including required worker deployment/bootstrap steps.
- [x] PostgreSQL readiness, schema initialization, persistence across restarts, and backup/restore are checked.
- [x] Sign-up, sign-in, sign-out, expired sessions, and cross-user access denial work (local HTTP checks; see auth progress).
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

### Deployment foundation — implemented; local web startup verified

- Implementation: `115e33e` (`Establish Docker Compose deployment foundation`) on `migration/deployment-docker-compose`; integrated into `main`.
- Implemented: root source, Node.js 24 image, standalone web runtime as non-root, loopback port, Compose networking, restart policy, credential-free process health check, and persistent Next.js cache.
- Passed: `npm run typecheck`; Node.js 24 production image via `npm run build`; `docker compose config --quiet`; `docker compose up -d --build --wait` using temporary non-live placeholders; HTTP 200/JSON from `/healthz` in the healthy container; non-root runtime and absence of `.env`, `.git`, and `reference/` in the image.
- Passed: `npm run bot:check`, `npm run deployment:check`, and the existing Sentry, chat-query, group-chat, and AI-chat checks. Integration boundaries are stubbed; these are not live provider acceptance.
- Changed application files pass focused ESLint. Full `npm run lint` fails with 17 errors and 10 warnings in unchanged reference components; the copied `components/` directory was compared against the reference and is identical.
- npm's image install reports 31 dependency vulnerabilities (7 low, 11 moderate, 13 high); no dependency upgrades or detailed security audit were included in this foundation change.
- Named `next-cache` persistence passed across forced container recreation. The temporary stack was stopped, placeholder `.env` removed, and named volume retained. No production deployment occurred.
- Host checks used Node.js 22.22.3; the production build/type analysis and running container used Node.js 24.22.1. The Node.js 24 Docker image and built application were rechecked against the latest official LTS release on 2026-10-26: both use 24.22.1, including the [October security fixes](https://nodejs.org/en/blog/vulnerability/october-2026-security-releases). Host Node.js remains below the patched 22.23.4 release.
- Configuration: copy `.env.example` to ignored `.env`; provide your own service accounts. Public Clerk/Sentry values are built into the image; server secrets are supplied only at runtime.
- Database/schema initialization and Trigger worker deployment are separate documented prerequisites. Compose currently starts only the web service.
- Login, ownership denial, subscriptions, streaming/tool execution, sandbox/desktop access, external data persistence, and telemetry delivery remain unverified.
- Remaining migration layers are **planned; branches prepared**. Overall completion requires the integrated acceptance checks above.

### Database — implemented; locally verified

- Branch: `migration/database-postgresql`, recreated from current `main` because the prepared branch had no unique commits and lacked the foundation.
- Implemented: PostgreSQL 18 Compose service, health-gated startup, private networking, named data volume, explicit Drizzle schema tools, one `DATABASE_URL`, and backup/restore instructions. Drizzle, `pg`, application queries, worker storage and ownership/usage logic are retained.
- Removed: unused Neon configuration and its two direct dependencies. No existing Neon data was imported or modified.
- Passed: host typecheck, focused ESLint, deployment handler, bot, chat-query, group-chat and AI-chat checks (provider boundaries stubbed). Full lint retains the existing 17 errors and 10 warnings in unchanged components.
- Passed on OrbStack context `orbstack`, Docker 29.8.2: healthy PostgreSQL 18, initial schema push, repeat push with no changes, rollback-only schema writes/unique-member/cascade checks, and live usage concurrency/idempotency/period/lease/bot-limit tests.
- Passed: a test row survived forced container recreation; custom-format `pg_dump` restored into a separate empty `mochi_restore_check` database, retained its test row, and passed the same schema/constraint check. The source test row was removed; original database and restore database remain in the named volume.
- Passed: production web and PostgreSQL containers became healthy; the built web runtime queried the local database. Test containers were stopped afterward, retaining named volumes and ignored `.env`.
- Node.js 24 schema-tools and production web images build successfully. Image installation still reports 31 dependency vulnerabilities (7 low, 11 moderate, 13 high); no dependency security audit or upgrades were included.
- Trigger.dev Cloud cannot resolve the private Compose hostname. Live agent execution requires securely connected workers and remains unverified; self-hosting is assigned to its own branch.
- Delivery is tracked in Git history; no production deployment. A generated local database password and placeholder Clerk public key are in ignored `.env`; supply real external provider credentials before application use.

- Reverified 2026-10-27 before delivery: typecheck, focused lint, bot/chat regressions, both image builds, healthy Compose startup, no-op schema push, live schema/usage checks, restored-database checks, and a query from the web runtime all passed. Full lint still reports only the recorded 17 errors and 10 warnings in unchanged components.

### Authentication — implemented; locally verified 2026-10-27

- Branch: `migration/auth-better-auth`, recreated from current `main`; the prepared branch had no unique commits. Delivery is tracked in Git history.
- Implemented Better Auth 1.7.13 with email/password login, PostgreSQL/Drizzle auth tables, database-backed sessions without cookie caching, signup/signin forms, sidebar logout, and a same-origin auth API. Removed Clerk login UI, middleware, public configuration and frontend packages; retained existing UI libraries.
- Web actions and queries use trusted Better Auth session IDs and retain ownership filters, validation, scoped Trigger tokens and usage limits. Worker paid checks now require an existing local auth user and an operator-verified legacy billing identity. No browser-supplied ID or email-based ownership linking is accepted.
- Transitional billing: only `@clerk/backend` remains for existing subscription checks, via unique server-owned `auth_user.clerk_user_id`. New accounts are unpaid. Checkout is unavailable until Lago integration; no users, credentials, sessions, ownership records or subscriptions were automatically migrated. See [auth setup and identity boundary](auth.md).
- Passed: host typecheck, focused ESLint, auth/session/billing checks, existing bot/chat-query/group-chat/chat/desktop/AI-chat/Sentry/deployment regressions (provider boundaries stubbed). Full lint retains the recorded 17 errors and 10 warnings in unchanged components.
- Passed on OrbStack context `orbstack`, Docker 29.8.2: additive auth schema push, repeat push with no changes, existing rollback-only database schema checks, Node.js 24 production image build and healthy web/PostgreSQL startup. Build uses a disposable process-only signing key; the stable runtime key is supplied from ignored `.env`.
- Passed against the running production web container: real signup and password signin, authenticated dashboard, signout/revoked session, database-expired session rejection, signed-out redirects, untrusted-origin rejection, denied signup/update attempts to set the billing link, unpaid entitlement checks, and cross-user chat not-found rendering. Temporary test users and their fixture records were removed. Next.js may stream a not-found boundary with HTTP 200, so denial checks inspect the rendered boundary.
- Browser verification after skill-guided rework: successful desktop signin/logout, mobile signup, generic incorrect-credential feedback, password visibility, and responsive 390px layout passed using disposable local accounts; accounts were removed.
- Local random `BETTER_AUTH_SECRET` and localhost origin were added to ignored `.env`. Existing PostgreSQL and cache volumes were preserved. No production deployment or live paid worker/provider execution is claimed.
- Remaining: Lago entitlements/checkout, any reviewed legacy account/data transfer, mail verification/recovery, OAuth/MFA, and external worker/inference/sandbox/telemetry acceptance. npm still reports 31 dependency vulnerabilities (7 low, 11 moderate, 13 high); dependency remediation is outside this migration.

#### Better Auth skill-guided rework — locally verified 2026-10-27

- Used repository Better Auth integration, security and email/password skills with official 1.7 documentation matching installed 1.7.13.
- Replaced Clerk-shaped session/permission APIs with `requireSession`, `getAccess`, and `useEntitlement`; identity-only queries no longer call billing. Paid actions and worker checks retain server-enforced entitlements and ownership.
- Added `nextCookies`, app name, explicit 12–128 password limits and rate limiting in every environment. Kept origin/CSRF/cookie defaults, database session validation and server-owned billing links. Signed-in visitors skip auth pages. No new dependency or database change.
- Redesigned shared signin/signup UI using existing components: desktop split layout, mobile form, password visibility, duplicate-submit guard, generic errors, rate-limit/network feedback and accessible pending states.
- Passed: typecheck, focused lint, auth/session/billing tests, bot/chat-query/group/chat/desktop/AI-chat regressions, production image build, healthy Compose startup, expanded live password policy/cookie/redirect checks and existing expiry/spoofing/origin/cross-user checks. Session regression specifically verifies identity reads do not call billing during provider failure.
- Unchanged limits: temporary Clerk Billing bridge, unpaid new users, no mail verification/recovery or live paid worker/provider acceptance. In-memory rate limits suit one web process and reset on restart; shared storage/trusted proxy configuration remains a deployment prerequisite for multiple replicas.

- Branding update: reused the supplied artwork from `docs/mochi-icon.png` for signin/signup marks and `app/icon.png`, replacing the old favicon. Transparent 512px asset, typecheck, focused lint, production image/healthy startup, browser appearance and live icon metadata/response were verified locally. Delivery is tracked in Git history.

- Auth reverified after the icon update (2026-10-27): `npm run auth:check`, `npm run auth:live`, public-page/signed-out redirect smoke checks, and bot/chat-query/group-chat/chat/desktop authorization regressions passed. Live checks used the healthy OrbStack Compose web/PostgreSQL stack and cleaned up disposable accounts/fixtures. Full browser interaction was not repeated in this run.

### Bot and chat UI revamp — implemented; locally verified 2026-10-27

- Branch: `revamp/bot-chat-ui`; delivery is tracked in Git history. Auth page components are unchanged. Dark is now the default theme; explicitly saved theme preferences and the existing theme shortcut remain supported.
- Implemented: workspace-scoped light/dark palette, branded sidebar with separate bot/group navigation, mobile sidebar closing on chat/search selection, populated workspace home, compact bot creation/editing form, and updated chat header/composer.
- Adapted Beautiful UI Tool Chips into `ChatTool`, using actual SDK tool states with accessible disclosures and existing input/output/error rendering. Added AI Elements Reasoning for provider-supplied reasoning parts; preserved streaming transport, saved transcript loading, group targeting/handoffs, screenshot filtering, validation, ownership, entitlements, and usage controls. No demo timers or fixture state enter production chat.
- Single-bot chats retain the sandbox toggle and lazily activated desktop panel; group chats have neither. Added vertical splitting on mobile and updated desktop status, connection, view-only preview, fullscreen entry, and scrollable error presentation. Existing noVNC connection reuse and explicit fullscreen-close semantics are retained. File/terminal tabs were not added without corresponding backend capabilities.
- Passed: typecheck, focused ESLint, bot, auth/session/billing, chat query/search, group, AI-chat/tool-state/reasoning/escaping/screenshot/handoff, desktop lifecycle, and direct/group workspace checks. Tests stub provider boundaries. The new workspace regression also checks missing-chat denial and mobile drawer closing.
- Passed on OrbStack `orbstack`, Docker 29.8.2: Node.js 24 production image build and healthy Compose web/PostgreSQL startup. Existing volumes were preserved; no schema migration or provider configuration change.
- Browser-checked using isolated local fixtures: dark workspace home, bot/group navigation, unpaid create/chat/desktop gates, direct sandbox panel opening, group sandbox exclusion, and mobile navigation. The disposable test account and fixture chats/bots were removed after verification.
- Unverified: real paid bot creation/editing, live agent streaming and reasoning, connected sandbox/fullscreen on a real provider, and full accessibility/device performance. No production deployment is claimed.
- Two previous component studies remain development-only at `/ui-prototype`; source provenance and integration boundaries are in [UI component study](ui-component-study.md).

- Collapsed-sidebar fix (2026-10-27): replaced the clipped inline account footer with a compact account menu; aligned collapsed header controls and chat icon heights. Added account-menu checks covering collapsed/expanded/mobile rendering and signout success/failure. Typecheck, focused lint, workspace/search/account regressions, production image build, and healthy Compose startup passed. Browser-verified expanded/collapsed layouts, account-menu opening/Escape dismissal, and that all collapsed header/footer controls fit inside the rail. Existing user session and collapsed preference were preserved; signout was tested with stubs only.
