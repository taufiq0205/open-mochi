# assistant-ui upgrade — tracer bullets

> Superseded by the shadcn mira revamp in `plan.md`.

Branch: `feature/assistant-ui-upgrade`. Keep changes uncommitted.

## Checklist

- [x] **1 — Direct composer:** existing AI SDK hook → Trigger.dev session →
  streamed response. User confirmed normal chat and tool/screenshot behavior.
- [x] **2 — Direct messages:** assistant-ui thread/message primitives, retaining
  Markdown, reasoning, grouped tools, errors/approvals and screenshot privacy.
- [x] **3 — Actions and welcome:** direct assistant-message copy controls and three
  starter prompts through assistant-ui suggestions.
- [x] **4 — Groups:** assistant-ui composer, bot selector, exact `data-target-bot`
  routing and transport clientData; existing raw-message avatars/handoffs retained.
- [x] **5 — Acceptance:** local checks and representative desktop/mobile/theme,
  keyboard, clipboard and live streaming/stop checks pass; limitations below.

## Implementation and parent review

Bullets 2–4 and source/render QA were performed by Luna subagents at xHigh,
then inspected and integrated by the parent.

The shared renderer retains the original tool/error/approval/screenshot branches.
`joinStrategy: "none"` preserves original message IDs. The group mapper preserves
text and metadata, rejecting missing/stale recipients; empty groups disable send.
Group controls reserve room for the send button on narrow screens. Theme tokens,
accessible labels, focus styles and pending/disabled states are retained.

No database, worker, server ownership, attachment, persistent branching or voice
changes. The existing Trigger generation-stop and history/reconnect paths remain.

## Verification

- Passed: `npm run assistant-ui:check` — real adapter send/stream/history; real
  assistant-ui message primitives, separate assistant IDs, copy/suggestion rendering
  and private screenshot omission; group mapper and composer states.
- Passed: existing AI-chat/handoff/reconnection/privacy and group regressions,
  TypeScript and focused ESLint.
- Passed: desktop authentication/lifecycle and local socket relay regressions.
- These checks mock service or visual boundaries. They do not prove live model,
  clipboard, keyboard, viewport or theme behavior.
- Dependency installation reports 56 audit findings (8 low, 35 moderate, 13 high).
  No audit fixes applied. Docker uses Node 24; host checks use Node 22.

## Browser acceptance record

- Before the final rebuild, the existing chat displayed its prior messages and
  shared screenshots. Browser automation disconnected opening responsive tools,
  then recovered. Final acceptance follows the rebuilt container.

- Passed final Docker build (Node 24), healthy Compose web service and HTTP 200
  `/healthz`. Existing history and shared screenshots rendered after refreshing.
- Passed browser direct-chat turn: sent an exact-response request, observed
  `ASSISTANT_UI_OK`, clicked Copy, and pasted the exact reply into the composer.
- Passed Shift+Enter multiline composition and Enter submission. Stopped a long
  number-list generation; controls returned to ready and output stopped at 636.
- Visually checked desktop light/dark themes and the 400px responsive viewport;
  composer, message/copy controls and text fit. Restored dark desktop view.
- Still unchecked: live group recipient/handoff interactions, starter-prompt clicks,
  physical mobile keyboards, and reconnecting during an active generation. Group
  routing/handoffs and empty-thread suggestions have local regression coverage.
- Two smoke-test user turns and their replies remain in the existing local chat.
  No user data was deleted; no Git commit, push or worker redeployment.
