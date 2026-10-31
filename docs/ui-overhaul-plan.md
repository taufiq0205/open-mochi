# Workspace styling overhaul

> Superseded by the shadcn mira revamp in `plan.md`.

Branch: `feature/assistant-ui-upgrade`.

## Direction

User-selected: more personality and creativity, inspired by React Bits.
Warm ivory/charcoal surfaces, apricot highlights, serif-accented headlines,
spotlight conversation cards and a short blur reveal. Existing bot avatars stay.
References: https://reactbits.dev/components/spotlight-card and
https://reactbits.dev/text-animations/blur-text. Original lightweight styling,
not a copy of their full animation components; no new dependencies.
This is a visible styling overhaul following the assistant-ui integration.

## Five screens

- [x] Main screen: clear welcome heading, primary create action, separate bot/group
  sections, and roomy conversation cards with useful secondary text.
- [x] Bot creation/edit: wider responsive dialog, clear avatar/name/role hierarchy,
  selectable role presets and a dedicated instructions section.
- [x] Sidebar: compact navigation, quieter timestamps, distinct active state,
  consistent bot/group rows and a clear create/search area.
- [x] Bot chat: assistant-ui-style message spacing, user bubbles, action bars,
  integrated composer and consistent tool details; retain sandbox access.
- [x] Group chat: matching chat styling, clear member identities/handoffs and a
  recipient control that fits narrow viewports.

## Shared foundation and acceptance

- [x] Inspect existing screen components and all layout callers.
- [x] Set one neutral light/dark palette and shared surface/spacing rules.
- [x] Preserve existing form validation, preset behavior, ownership, streaming,
  screenshot privacy, cancellations, bot selection and sandbox lifecycle.
- [ ] Run focused checks, TypeScript and lint; build/start through Docker Compose.
- [ ] Visually verify all five screens on desktop and mobile, both themes, and
  keyboard access to forms, navigation and chat controls.

No schema, worker, authentication or provider changes. Keep changes uncommitted.

## Local checks

TypeScript, focused lint, assistant-ui adapter/render/group checks, workspace and
sidebar checks, AI-chat/handoff/privacy and bot/group action regressions pass.
`node scripts/check-studio-card.mjs` checks native link routing and relative pointer
coordinates. Docker build and browser acceptance are in progress.
