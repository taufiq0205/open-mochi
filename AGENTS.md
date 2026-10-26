# open-mochi

Be extremely concise.

## Project

Build a self-hostable, open-source counterpart to Mochi with one-command Docker Compose startup. Before migration work, read `docs/plan.md` for scope, branch mapping, dependencies, and acceptance criteria.

Use `reference/mochi/` as the primary implementation reference. It is a local, ignored checkout with its own Git repository; preserve it as reference material. Implement open-mochi in the root repository. If the reference is missing, report it rather than assuming it is tracked.

## Workflow

- Inspect the relevant reference code and every affected caller before implementing. Reuse its working patterns and preserve authentication, ownership checks, validation, usage limits, and error handling.
- Use the smallest complete change. Keep libraries already open source unless a migration requires replacing them.
- Inspect the current branch and working tree before edits. Creating or switching branches, merging, committing, and pushing require an explicit user request; existing migration branches do not authorize switching automatically.
- For stack migration work, use the branch assigned in the **Stack and branch mapping** table in [docs/plan.md](docs/plan.md). Treat that table as authoritative. If the current branch differs, obtain explicit authorization to switch before editing; keep shared foundation work on `migration/deployment-docker-compose` and integrate dependent changes in the documented sequence.
- Keep work uncommitted unless requested. Keep `reference/`, credentials, environment files, and generated artifacts out of commits.
- Update migration status in `docs/plan.md` when implementation or verification changes it. Distinguish planned, implemented, locally verified, and deployed.

## Docker and validation

- Use Docker Compose for the local stack; OrbStack supplies the local Docker engine. Verify the active Docker context and daemon before container checks.
- Keep secrets in ignored environment files or Docker secrets. Commit only placeholder examples; never bake server secrets into images or expose them through public environment variables.
- Preserve service data in named volumes and make readiness explicit with health checks. Destructive database or volume resets require explicit authorization.
- Add a focused test for non-trivial logic. Run checks from the implemented application's own scripts, then verify affected live integrations separately.
- A successful image build is not proof of working login, billing, agent execution, model tools, sandbox isolation, desktop access, or telemetry. Report unchecked paths.
