# Coordex Project Method

This file explains the minimum working method for a project bootstrapped by Coordex.

## Core Loop

1. The human writes the real project identity and stack into the root `AGENTS.md`.
2. The human creates durable role agents under `Agents/<role>/`.
3. The supervisor owns the current goal and breaks it into subfunctions in `.coordex/current-plan.md`.
4. Each subfunction has exactly one owner role, and the supervisor should not self-assign worker-owned implementation by default.
5. The human or the supervisor opens the owner role thread and sends the concrete assignment.
6. Worker roles reply with concise, structured handoff or result messages.
7. The supervisor updates the current plan, delivery ledger, and any needed decision log entries.

## Scope Rules

- Do not dispatch one subfunction to two implementation roles at the same time.
- Do not widen scope inside worker coordination. Escalate scope changes back to the supervisor or human.
- If a subfunction depends on engine, platform, framework, editor, build, or runtime behavior, check official docs and the real project stack facts before implementation.
- Prefer existing documented engine, framework, platform, or runtime capabilities before custom workaround code.
- If browser validation is required, reuse the project's dedicated Chrome workflow instead of launching an ad-hoc default browser instance.
- Prefer reusing an already-open dedicated-browser tab for the current preview or target page instead of opening duplicate tabs.
- Use durable docs for repeated context instead of relying on thread memory.

## Durable Files

- Root rules: `AGENTS.md`
- Current plan: `.coordex/current-plan.md`
- Plan history: `.coordex/plan-history.md`
- Role state: `docs/project/role-state/<role>.md`
- Delivery history: `docs/project/delivery-ledger.md`
- Important decisions: `docs/project/decision-log.md`

## First Supervisor Action

If the project has no meaningful current plan yet, the supervisor's first real task is to draft the current goal and the first set of subfunctions before dispatching implementation work.

The supervisor should not jump straight into implementation when a matching worker role already exists.
Plan first, then route the first concrete work order to the single owner role.
