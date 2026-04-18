# Thread Permissions And Approvals

This document records how Coordex currently configures Codex thread execution through `codex app-server`.

## Current rule

Coordex does not yet implement an approvals UI.

Because of that, any Coordex-managed thread that falls back to interactive approval can stall invisibly from the browser operator's perspective.

To avoid that deadlock, Coordex currently applies a no-prompt full-access policy to the threads it manages:

- `thread/start`: `approvalPolicy: "never"`, `sandbox: "danger-full-access"`
- `thread/resume`: `approvalPolicy: "never"`, `sandbox: "danger-full-access"`
- `turn/start`: `approvalPolicy: "never"`, `sandboxPolicy: { type: "dangerFullAccess" }`

This applies to both root chats and role-agent chats created or resumed through Coordex.

## Why this is necessary

- The browser UI can start threads and send turns, but it cannot currently surface app-server approval prompts.
- A thread that hits a hidden approval request can appear to be "thinking" forever even though it is actually blocked.
- Agent initialization must complete inside the browser workflow, so it cannot depend on a separate manual approval surface.

## App-server capability

The current `codex app-server` protocol supports the fields Coordex uses:

- thread-level `approvalPolicy`
- thread-level `sandbox`
- turn-level `approvalPolicy`
- turn-level `sandboxPolicy`

That means this behavior is a deliberate Coordex policy choice, not a protocol limitation.

## Practical consequence

Until Coordex grows a real approvals surface, browser-created and browser-driven work should be treated as:

- high autonomy
- no interactive approval pauses
- equivalent to full local trust in the selected project workspace

If a future version adds approvals UI, this policy can be narrowed again.
