# Agents Directory

These instructions apply to every Codex thread started under this directory. The project root `AGENTS.md` still applies first.

- Directory: `{{AGENTS_DIRECTORY_NAME}}`
- Template: `{{PROJECT_TEMPLATE_KEY}}`
- Purpose: Visible role threads for a game project. Keep one role per subdirectory under this folder.
- Use English directory names that are stable and machine-safe.
- Put role-local behavior in `AGENTS.md` inside the role directory instead of overloading this shared layer.

## Shared Coordination Rules

- Durable role threads under this directory are visible project assets, not disposable hidden workers.
- The human operator or the supervisor starts the active subfunction owner. Once a subfunction is active, peer roles may coordinate directly only inside that subfunction's scope.
- Use the structured coordination contract in `docs/process/structured-agent-communication-protocol.md` for role-to-role, role-to-supervisor, and completion messages whenever that doc exists.
- Do not widen task scope during peer coordination. Route scope, priority, or acceptance changes back to the supervisor or human.
- Keep task-specific scope in chat messages, work orders, plans, or ledgers instead of rewriting it into persistent `AGENTS.md` files.
- Before non-trivial work, read the stable project docs relevant to your role instead of guessing the current stack, milestone, or workflow.
- For tasks that depend on external platform, engine, editor, or build rules, read the official docs and follow `docs/process/engineering-standards.md` instead of guessing from memory.
- When the project already names a concrete stack in the root `AGENTS.md`, follow that named stack instead of drifting back to older repo history or template assumptions.
- Prefer existing documented engine, framework, platform, or runtime capabilities before inventing custom workaround flows.
- If the session has gone long enough that earlier constraints may be stale or compacted, re-read `.coordex/current-plan.md`, the relevant role-state file, and the project method before changing direction.
- If a project fact becomes repeatedly necessary, ask for it to be written into the project docs rather than relying on thread memory alone.
- Keep handoffs auditable by reporting touched artifacts, validation, blockers, and the recommended next owner.

## Shared Startup Docs

Read these before non-trivial work if they exist:

- `docs/project/project-method.md`
- `.coordex/current-plan.md`
- `docs/project/decision-log.md`
- `docs/process/structured-agent-communication-protocol.md`
- `docs/process/engineering-standards.md`
- `docs/process/development-loop.md`
- `docs/project/delivery-ledger.md`

If a listed file is missing, continue with the files that do exist.
