# Coordex Code vs Template Boundary

This document defines a simple rule for deciding whether a problem belongs to Coordex product code or to a project template.

It exists to stop two failure modes:

- patching Coordex code to compensate for a bad role template
- patching role templates to compensate for a broken Coordex product flow

## Core rule

Coordex is primarily:

- a local coordination product
- a visible thread and plan-management surface
- a template bootstrap and runtime-maintenance tool

Coordex is not the project's hidden source of truth about how a role should think.

If the issue is about visible product behavior, synchronization, or generated runtime state, it usually belongs in Coordex code.

If the issue is about role behavior, role understanding, durable workflow rules, or reminder content, it usually belongs in the template files that Coordex bootstraps into projects.

## What Coordex code owns

Coordex product code should own:

- UI layout and interaction flow
- project registration and bootstrap flow
- role creation flow
- thread start, initialization, resume, archive, and selection flow
- the three-way sync contract between role directory, Codex thread, and root `AGENTS.md` roster block
- runtime plan and board state such as `.coordex/current-plan.md`, `.coordex/plan-history.md`, and `.coordex/project-board.json`
- project-local file generation logic for missing bootstrap files
- browser-side project observation and validation surfaces
- the product-level schema that Coordex itself reads or writes

If a bug appears because Coordex cannot correctly display, parse, persist, or synchronize its own data model, fix Coordex code.

## What templates own

Project templates should own:

- reusable template source under `templates/<template-key>/`
- role charters under `Agents/<role>/AGENTS.md`
- shared role-space rules under `Agents/AGENTS.md`
- project bootstrap docs under `docs/process/`, `docs/project/`, and `docs/templates/`
- the content of SessionStart reminder scripts that Coordex seeds into projects
- structured role-to-role communication rules
- project-method guidance for planning, dispatch, handoff, acceptance, and archival
- startup doc lists and role-local read priorities
- anti-drift instructions for context compaction and resume

If a role keeps misunderstanding its authority, plan-writing format, communication contract, or acceptance behavior after reading the generated files, fix the template content in `templates/<template-key>/`.

## Runtime data is not template content

Do not confuse template files with runtime project data.

Template content is the reusable baseline Coordex copies into a new project from `templates/<template-key>/`.

Runtime data is project-specific state that changes during execution, such as:

- the root `AGENTS.md` role roster block
- current plan
- historical plans
- role-state files
- thread bindings

Coordex is allowed to maintain runtime data because that is part of the product's coordination surface.

That does not mean Coordex should hardcode project-specific role behavior into application logic.

## Decision checklist

Ask these in order:

1. Is the problem in UI, thread lifecycle, synchronization, parsing, persistence, or browser validation?
If yes, change Coordex code.

2. Is the problem that a role followed the wrong workflow, forgot a durable rule, or used the wrong coordination format?
If yes, change the template docs or template hook content.

3. Is the problem in generated reusable scaffolding for future projects?
If yes, change the template source in Coordex, not only one live project.

4. Is the problem only in one live project's current state?
If yes, repair that project's runtime docs or state instead of changing product code.

## Product discipline

Coordex should avoid:

- adding business logic hacks just to force one role to behave correctly
- burying durable workflow truth inside React or server code
- treating prompts as the only source of process truth
- using code changes when the real problem is a weak template

Coordex should prefer:

- product code for product behavior
- template files for role behavior
- runtime docs for live project state
- small durable fixes that future projects can inherit

## Practical interpretation for the default game-development template

For `supervisor`, `engineer`, and `art_asset_producer`:

- if the left panel, plan board, thread selection, or project sync behaves incorrectly, fix Coordex code
- if a role writes the wrong kind of plan, routes work incorrectly, or forgets the communication contract, fix the template
- if a live project's current plan or role state is wrong, fix that project's docs and then decide whether the reusable template also needs the same improvement

That is the intended development loop:

- observe the project through Coordex
- determine whether the failure is product-side or template-side
- fix the correct layer
- if the fix is reusable, propagate it back into the Coordex template source
