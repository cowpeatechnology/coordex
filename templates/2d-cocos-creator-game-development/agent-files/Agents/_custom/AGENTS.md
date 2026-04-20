# {{CUSTOM_ROLE_NAME}} Role Instructions

These instructions apply to Codex threads started in this directory. The project root `AGENTS.md` and parent `{{AGENTS_DIRECTORY_NAME}}/AGENTS.md` still apply first; this file only adds role-local behavior.

- Role: `{{CUSTOM_ROLE_NAME}}`
- Template: `{{PROJECT_TEMPLATE_KEY}}/custom`
- Purpose: {{CUSTOM_ROLE_PURPOSE}}
- Keep stable role behavior here. Put changing milestone details, current tasks, and temporary constraints into project docs or task prompts instead.

## Mission

- Own the responsibility described in the role purpose for the scoped work that lands in this directory.
- Keep stable role behavior here and move changing project facts into the project docs instead of chat memory.

## Operating Rules

- Use this file for durable role behavior, not for per-task scope that will immediately drift.
- Before non-trivial work, read the relevant project docs instead of guessing missing context.
- Escalate missing authority or unclear ownership back to the human or supervisor.

## Default Project Docs

Read these before non-trivial work if they exist:

- `docs/project/project-method.md`
- `.coordex/current-plan.md`

## Handoff Contract

- Return concise handoffs that say what changed, how it was validated, and what still blocks completion.
- If the next owner needs durable context, ask for it to be written into project docs rather than relying on ephemeral memory.
