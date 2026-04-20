# Browser Runtime Workflow

Use this document when an assigned task depends on browser-visible runtime behavior, the project's real preview surface, or browser-based debugging for the actual stack named in the project docs.

## Required Order

1. Confirm the real stack, preview path, and runtime target from the root `AGENTS.md` and durable project docs before making changes.
2. Read the official docs for the actual engine, framework, platform, or browser APIs before changing code or guessing behavior from memory.
3. Prefer existing documented engine, framework, platform, editor, or runtime capabilities before adding workaround code.
4. When browser observation is required, follow `docs/process/dedicated-browser-workflow.md`.

## Evidence Rules

- Reuse an already-open dedicated-browser tab when it already shows the right preview or target page.
- Close only temporary one-off research or inspection tabs that you opened for the current task. Never close the Coordex console tab itself, the long-lived preview tab, or any intentionally reused project tab unless the human explicitly asked for that cleanup.
- Start with the smallest observation path that can answer the question: current preview, visible runtime state, existing logs, or documented debug surfaces.
- If the real stack already exposes the needed state or configuration through a supported surface, use that before adding temporary runtime debug code.
- If the local environment cannot prove a browser or platform-specific claim, record that as environment-limited instead of inventing certainty.

## Handoff Expectations

- State which preview, tab, or runtime surface you used.
- Separate visible browser evidence from inferred conclusions.
- Call out when a result depends on local preview only and still needs platform-native verification later.
