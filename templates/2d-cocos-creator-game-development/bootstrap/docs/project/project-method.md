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
8. Coordex code maintains the machine board lifecycle such as execution state, history rollover, and archived-plan transitions.

## Scope Rules

- Do not dispatch one subfunction to two implementation roles at the same time.
- Do not widen scope inside worker coordination. Escalate scope changes back to the supervisor or human.
- If browser validation is required, reuse the project's dedicated Chrome workflow instead of launching an ad-hoc default browser instance.
- Prefer reusing an already-open dedicated-browser tab for the current preview or target page instead of opening duplicate tabs.
- For Cocos configuration, build, scene, and editor-state questions, follow `docs/process/engineering-standards.md` and `docs/process/cocos-mcp-workflow.md` instead of improvising a runtime-code workaround.
- Use durable docs for repeated context instead of relying on thread memory.

## Durable Files

- Root rules: `AGENTS.md`
- Current plan: `.coordex/current-plan.md`
- Plan history: `.coordex/plan-history.md`
- Machine board state: `.coordex/project-board.json`
- Role state: `docs/project/role-state/<role>.md`
- Delivery history: `docs/project/delivery-ledger.md`
- Important decisions: `docs/project/decision-log.md`
- Cocos-specific workflow guardrails: `docs/process/cocos-mcp-workflow.md`

## File Boundaries

- The supervisor's normal planning surface is `.coordex/current-plan.md`.
- `.coordex/project-board.json` is a machine-consumed Coordex state file, not a free-form supervisor document.
- Do not rewrite `.coordex/project-board.json` during ordinary planning if `.coordex/current-plan.md` already expresses the intended goal and subfunctions.
- Only repair `.coordex/project-board.json` when the human explicitly asks for a board fix or when a documented workflow says a direct machine-file repair is required.
- If a repair is required, preserve the exact current Coordex schema, including `ownerRole`, `done`, `runState`, and `coordinations` for each feature.

## First Supervisor Action

If the project has no meaningful current plan yet, the supervisor's first real task is to draft the current goal and the first set of subfunctions before dispatching implementation work.

The supervisor should not jump straight into implementation when a matching worker role already exists.
Plan first, then route the first concrete work order to the single owner role.
Do not block that first plan on deeper engine, framework, or runtime research. If technical detail is still uncertain, encode that uncertainty into an engineer-owned subfunction or validation step and keep the planning loop moving.

## Canonical Plan Shape

When the supervisor writes or rewrites `.coordex/current-plan.md`, use the canonical checkbox-row form that Coordex parses reliably.

Full sample:

```md
# Current Plan

**Created**: `2026-04-20T10:00:00+08:00`  
**Updated**: `2026-04-20T10:00:00+08:00`

## Goal

用中文写给人类看的当前里程碑目标正文。

## Subfunctions

- [x] 合同冻结 (`supervisor`)
  - Description: 冻结本轮范围、验证边界与不做项。
  - Coordination:
    - supervisor keeps scope boundary and acceptance ownership.
  - Notes: optional bounded reminder

- [ ] 运行时实现 (`engineer`)
  - Description: 完成本轮最小实现并给出可复核证据。
  - Coordination:
    - may align naming or asset contract with `art_asset_producer` inside this active subfunction only.
  - Notes: keep out-of-scope systems closed

- [ ] 资产交付 (`art_asset_producer`)
  - Description: 补齐本轮所需资产并给出尺寸、格式、命名与导入约定。
  - Coordination:
    - align export and naming contract with `engineer`.
  - Notes: do not expand into unrelated variants
```

Rules:

- Keep the machine-readable section tokens `Goal`, `Subfunctions`, `Description`, `Coordination`, `Notes`, `Created`, and `Updated` in English even when the human-facing goal body and subfunction titles are localized.
- Keep the owner on the same checkbox main line as the title, using `(\`role\`)`.
- Keep completion state on that same checkbox main line via `- [ ]` or `- [x]`.
- Keep `Description`, `Coordination`, and `Notes` as indented bullets under the main line.
- Do not replace this shape with ad-hoc `### ...`, `Owner:`, or `Status:` blocks.
