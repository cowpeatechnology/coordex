# Project Bootstrap Package

This document defines the minimum package Coordex now copies from an internal template source into a newly registered local project root when the target files do not already exist.

The point is not to auto-design the project. The point is to ensure a brand new project can immediately use the Coordex workflow without re-learning the same structure from zero.

## Why this exists

Without a bootstrap package, a newly registered project has a visible UI but not a usable operating method.

That causes the same failure pattern:

- the root project has no durable identity doc
- role threads exist but do not know where stable project facts belong
- the supervisor has no canonical current-plan location
- context that should survive compaction stays only in chat history
- every new project has to rediscover the same workflow conventions manually

Coordex should reduce that setup cost.

## What gets created

When a project root is registered, Coordex now copies missing files from `templates/<template-key>/bootstrap/` and syncs the root workflow block in `AGENTS.md`.

The default template today is `templates/game-development/`.

That bootstrap currently includes:

- `AGENTS.md`
- `.codex/config.toml`
- `.codex/hooks.json`
- `.codex/hooks/session-start-context.mjs`
- `docs/project/project-method.md`
- `docs/project/delivery-ledger.md`
- `docs/project/thread-conversation-ledger.md`
- `docs/project/decision-log.md`
- `docs/process/engineering-standards.md`
- `docs/process/development-loop.md`
- `docs/process/thread-conversation-protocol.md`
- `docs/process/structured-agent-communication-protocol.md`
- `docs/templates/supervisor-work-order-template.md`
- `docs/templates/worker-handoff-template.md`
- `docs/templates/thread-message-template.md`

Coordex also ensures the plan files under `.coordex/` exist as part of the template baseline and continues to maintain them through the project-board layer:

- `.coordex/current-plan.md`
- `.coordex/plan-history.md`
- `.coordex/project-board.json`

The bootstrap baseline already includes role-state files for the default template roles.

When extra custom role agents are created, Coordex also creates a missing matching role-state file from the selected template's custom scaffold:

- `docs/project/role-state/README.md`
- `docs/project/role-state/<role>.md`

## What each part is for

### Root `AGENTS.md`

This is the hard project entrypoint.

It should hold:

- real project identity
- real stack summary
- key directories
- stable cross-role rules
- the durable Coordex role roster block

The templated file is only a placeholder until the human fills in real facts.

### `.codex` SessionStart layer

This is the context-retention reminder layer, sourced from the project template rather than assembled inline in product code.

Coordex enables project-scoped hooks and adds a `SessionStart` script that re-surfaces a compact reminder from:

- `AGENTS.md`
- `.coordex/current-plan.md`
- `docs/project/role-state/<role>.md`
- `docs/project/project-method.md`

It exists to reduce drift after resume and possible compaction-related context loss. It is not the source of truth.

### `.coordex/current-plan.md`

This is the canonical live plan surface for the current iteration.

The supervisor owns it. It should stay short:

- one current goal
- multiple single-owner subfunctions
- completion state per subfunction

### `docs/project/role-state/<role>.md`

This is the canonical durable state for one role's current assignment.

It should hold only high-value information that must survive beyond one chat turn, such as:

- current assignment
- durable constraints
- current blockers
- next recommended step

It should not become a second chat log.

### Process and template docs

These files give a brand new project a usable operating baseline:

- structured communication protocol
- development loop
- engineering standards
- work-order and handoff templates
- decision and delivery ledgers

They exist so new projects start with a visible coordination method instead of ad hoc prompting.

## Non-goals

This bootstrap package does not try to:

- infer the real product vision
- infer the real tech stack
- infer the real debug workflow
- auto-author the current plan
- replace human supervision
- replace role-local `AGENTS.md`

Those still require project-specific input.

## Required human follow-up

After registering a new project, the minimum human follow-up is:

1. Fill in the real root `AGENTS.md` identity, stack, and key directories.
2. Create the needed role agents.
3. Ask the supervisor to draft the first real current goal and subfunctions.
4. Update role-state files when the same missing context would otherwise need to be re-explained.

If these steps are skipped, the project has scaffolding but not a real working method yet.

## Product rule

The bootstrap package should stay minimal, generic, and safe to keep.

Coordex should prefer:

- small durable files
- visible operator control
- placeholder scaffolding that humans can refine

Coordex should avoid:

- large speculative roadmaps
- project-specific assumptions
- hidden state that only exists in prompts
- overwriting existing project docs
