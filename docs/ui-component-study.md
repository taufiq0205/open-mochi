# Bot and chat component study

Two development-only drafts at `/ui-prototype?variant=a` and `?variant=b`. These replace the rejected three-concept exploration.

| Resource | Selected component | Integration in both drafts |
| --- | --- | --- |
| [Beautiful UI Thinking](https://www.beautifului.dev/#thinking-state) | `ThinkingState` | Expandable step trace populated from the typed reasoning fixture. |
| [Beautiful UI Tool Chips](https://www.beautifului.dev/#tool-chips) | `ToolChips` | Compact file/tool rows with expandable result details. |
| [AI Elements](https://github.com/vercel/ai-elements) | `Conversation`, `Message`, `MessageResponse`, `MessageActions` | Existing local components render the thread and Markdown response. |
| AI Elements | `PromptInput`, `PromptInputTextarea`, `PromptInputSubmit` | Existing local composer; demo submission only. |
| AI Elements | `Tool`, `ToolHeader`, `ToolOutput` | Error and retry presentation, available through “Show error state”. |
| Existing Base UI components | `Dialog` | Bot creation with focus management and keyboard dismissal. |

## Source provenance

- Official skills read: [AI SDK](https://github.com/vercel/ai/blob/main/skills/use-ai-sdk/SKILL.md), [AI Elements](https://github.com/vercel/ai-elements/blob/main/skills/ai-elements/SKILL.md). SDK APIs checked against installed `node_modules/ai/docs/` and local component implementations.
- Retrieved 2026-10-27: [thinking-state registry](https://www.beautifului.dev/r/thinking-state.json), [tool-chips registry](https://www.beautifului.dev/r/tool-chips.json), and [foundation registry](https://www.beautifului.dev/r/foundation.json).
- Beautiful UI source is copied into `app/ui-prototype/beautiful-ui/` under its [MIT license](https://www.beautifului.dev/license). The full notice is retained beside the source.
- Adaptations: map foundation utility tokens to locally scoped CSS variables, namespace animation names, hide collapsed content from keyboard/accessibility navigation, omit empty diff controls, and use project-specific fixture content. No foundation-wide stylesheet or shadow plugin was installed.

## Draft differences

- **Compact thread:** one reading column. Tool results and the generated file stay inside the conversation; a narrow sidebar separates bots from chat history.
- **Working canvas:** the generated Markdown document occupies the main workspace; a narrower chat stays beside it, with independent scrolling. On mobile the document preview stacks above chat.

## Boundaries

Fixture activity uses the upstream demonstration timers. It does not measure real model reasoning or execute tools. Text submission, creation, error/retry, search, and file previews use local memory only. The generated document is sample output, not operational setup guidance.

Production integration must retain existing authorization, ownership, streaming transport, group handoffs, tool errors, and screenshot filtering. Do not replace those paths with the fixture renderer. Approval prompts, connectors, new model selection, and file upload were not added because this task has no corresponding backend change.

## Local checks

Typecheck, focused ESLint, and whitespace checks passed. Desktop rendering of both drafts, 375px canvas rendering without horizontal overflow, tool disclosure, error/retry, bot creation, document tabs, and composer submission were browser-checked. The corrected draft has no nested buttons. Full accessibility, production builds, live streaming, desktop/sandbox connections, and provider execution were not verified for these drafts.

## Production integration

The workspace now uses the compact-thread direction with a direct-chat sandbox panel. `components/chat-tool.tsx` adapts the Beautiful UI Tool Chips row and disclosure pattern to actual AI SDK states; attribution is in `components/beautiful-ui-LICENSE`. AI Elements handles conversation, Markdown, real provider reasoning, composer, and tool input/output content. The gallery's timers and fixture data remain confined to the development-only prototype.

Dark is the default; `components/workspace.css` scopes workspace colors so auth styling remains intact. The existing theme preference and shortcut are retained. Existing direct-chat noVNC behavior is restyled rather than replaced. Group chats do not mount a sandbox panel. File and terminal tabs are deferred because the current UI has no corresponding dedicated capabilities.
