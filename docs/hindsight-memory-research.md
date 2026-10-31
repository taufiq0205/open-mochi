# Hindsight persistent memory assessment

Researched 2026-10-31. Assessment only; no integration implemented.

## Fit

Hindsight can serve as memory outside the expiring execution sandbox. Its `retain` operation extracts facts; `recall` retrieves relevant memories; `reflect` generates an answer through additional reasoning. SDKs, MCP and HTTP are available. This is retrieval of retained information, not a guarantee that the agent remembers every message. [Overview](https://hindsight.vectorize.io/)

The official Node client is `@vectorize-io/hindsight-client`, configured with a service `baseUrl`; it exposes `retain(bankId, content)`, `recall(bankId, query)` and `reflect(bankId, query)`. [Quickstart](https://hindsight.vectorize.io/developer/api/quickstart)

## Proposed open-mochi boundary

- Use one server-selected bank per owner and bot; preserve private/group sharing for that bot and existing group handoffs. Banks isolate their stored memories, but application ownership authorization must still gate access. Never accept arbitrary bank IDs from model arguments or the browser. [Bank isolation](https://hindsight.vectorize.io/developer/api/memory-banks)
- Make memory tools independent of `sandboxId`; sandbox expiry should affect execution files, not Hindsight recall. Use `recall` and `retain` first; the existing chat agent can compose replies without adding `reflect` initially. These are integration recommendations, not existing behavior.
- Retain useful user facts with stable source document IDs. Hindsight keeps original source chunks as well as extracted facts; do not treat this as storage of summaries alone. Reusing a document ID replaces old content, so choose IDs deliberately. [Documents](https://hindsight.vectorize.io/developer/api/documents)
- Define corrections, forgetting and bot/account deletion before launch. Document deletion removes its associated memories; bank deletion is a separate available operation. Test derived-memory behavior and prevent queued writes from restoring forgotten data. [Documents](https://hindsight.vectorize.io/developer/api/documents), [Banks](https://hindsight.vectorize.io/developer/api/memory-banks)

## Deployment and limits

Cloud and self-hosted deployments are available. Self-hosting requires PostgreSQL 14+ with a supported vector extension, and an LLM for extraction/entity resolution/answer generation. Production documentation recommends external PostgreSQL rather than embedded pg0. Docker development examples persist pg0 in a named volume; production workers should use a stable worker ID. Persistence therefore depends on durable service storage and backups, independently of sandbox TTL. [Installation](https://hindsight.vectorize.io/developer/installation), [Quickstart](https://hindsight.vectorize.io/developer/api/quickstart)

Acceptance checks should cover recall after deleting an execution sandbox, service restart persistence, cross-owner/cross-bot denial, group handoff recall, correction/forgetting, failed retention, and delayed/background processing. No service deployment, SDK compatibility test, latency/cost measurement, or end-to-end recall test was performed for this assessment.
