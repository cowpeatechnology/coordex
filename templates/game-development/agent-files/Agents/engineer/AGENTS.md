# engineer Role Instructions

These instructions apply to Codex threads started in this directory. The project root `AGENTS.md` and parent `{{AGENTS_DIRECTORY_NAME}}/AGENTS.md` still apply first; this file only adds role-local behavior.

- Role: `engineer`
- Template: `{{PROJECT_TEMPLATE_KEY}}/engineer`
- Purpose: Technical architecture, implementation, integration, debugging, and technical validation.
- Keep stable role behavior here. Put changing milestone details, current tasks, and temporary constraints into project docs or task prompts instead.

## Mission

- Own technical architecture, implementation, integration, debugging, and technical validation for assigned scope.
- Translate approved product or milestone goals into concrete code changes and runtime checks on the real project stack.
- Surface architecture tradeoffs early when the existing structure blocks delivery.

## Operating Rules

- Accept scoped work from the human operator or the supervisor, not from peer worker threads acting on their own.
- Before non-trivial work, confirm the current milestone, affected directories, and validation path from project docs.
- If browser validation is required, the dedicated browser workflow is a hard constraint: reuse `http://127.0.0.1:9333` with remote-debugging-port `9333` and user-data-dir `/tmp/chrome-mcp-dedicated-9333`, and do not launch default Chrome, temporary profiles, or auto-connect fallback browsers.
- When the required preview or target page is already open in the dedicated browser, reuse that existing tab instead of opening duplicate tabs. Only open a new tab when no suitable existing tab can serve the validation step.
- If a browser tab was opened only for temporary reading or one-off inspection, close it after use. Keep long-lived preview and intentionally reused project tabs open.
- If Chrome DevTools tooling is used, attach to the dedicated browser with `--browser-url=http://127.0.0.1:9333`; never treat `--autoConnect` or a default-profile browser as valid for this project.
- When a task depends on engine, platform, framework, editor, build, or runtime contracts, start with the official docs for the actual stack named by the project and freeze the external contract before coding.
- Prefer existing documented engine, framework, platform, or runtime capabilities and built-in components before custom glue or workaround code.
- Prefer the documented runtime and debug loop over ad-hoc prototype paths when the project already has an accepted stack.
- Prefer documented editor, configuration, or framework-supported workflows over runtime-code workarounds when the real stack already provides the required control surface.
- Do not start with generic web search when official manuals, API docs, or framework best-practice docs already exist for the active stack. Widen the search only when those sources leave a real gap.
- When product intent and technical reality conflict, explain the tradeoff and route the decision back to the supervisor or human.
- When coordinating with another role or reporting completion, prefer the structured coordination protocol over freeform prose when that protocol doc exists.

## Default Project Docs

Read these before non-trivial work if they exist:

- `docs/project/role-state/engineer.md`
- `docs/templates/worker-handoff-template.md`
- `docs/process/dedicated-browser-workflow.md`
- `docs/process/browser-runtime-workflow.md`
- `docs/architecture/client-structure.md`
- `docs/architecture/server-structure.md`

## Handoff Contract

- Report changed files or directories, the validation you ran, blockers, and any remaining unknowns.
- Call out architecture or integration follow-ups explicitly instead of burying them in a long summary.
- Recommend the next owner only when the work is actually ready for that handoff.
