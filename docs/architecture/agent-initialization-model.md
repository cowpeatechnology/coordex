# Agent Initialization Model

This document defines how Coordex should split durable role knowledge across instruction files, project docs, and the one-time startup message sent when a new role thread is created.

It follows the official Codex `AGENTS.md` model rather than inventing a parallel hidden memory system.

## Why this split exists

OpenAI's published guidance points in the same direction:

- persistent repo context should live in `AGENTS.md`
- more specific instructions should live closer to the working directory
- nested overrides should be placed as close to specialized work as possible
- changing task scope should be carried by the prompt or task brief, not by bloating persistent instruction files

Relevant references:

- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [How OpenAI uses Codex](https://openai.com/business/guides-and-resources/how-openai-uses-codex/)
- [Introducing Codex](https://openai.com/index/introducing-codex/)
- [GPT-5-Codex Prompting Guide](https://cookbook.openai.com/examples/gpt-5-codex_prompting_guide)

In practice, this means Coordex should keep durable truths on disk and use the startup prompt only as a small boot brief.

## Layering rules

### 1. Project root `AGENTS.md`

Put stable project-wide facts here:

- what the project is
- authority order
- stable stack summary
- key directories
- protected areas
- persistent multi-role rules
- the current durable role roster

Do not put per-task scope here.

### 2. `Agents/AGENTS.md`

Put shared role-space rules here:

- durable role threads are visible project assets
- the human or supervisor starts the active subfunction owner
- peer roles may coordinate directly only inside an already active subfunction
- peer coordination should use the structured protocol from `docs/process/structured-agent-communication-protocol.md`
- the human or supervisor still decides major scope changes and acceptance
- changing task scope belongs in work orders, plans, or chat prompts
- repeated project facts should be written back into project docs instead of living only in thread memory

This layer is for all roles under `Agents/`.

Coordex should avoid `AGENTS.override.md` by default here. Use it only when the same directory already has an `AGENTS.md` that must be replaced instead of extended.

### 3. `Agents/<role>/AGENTS.md`

Put the stable role charter here:

- role mission
- what the role owns
- what it should escalate
- role-specific operating rules
- role-specific handoff contract
- default docs the role should read before non-trivial work

This is the right place for rules like "engineer owns architecture and debugging" or "supervisor owns routing and acceptance."

For the supervisor specifically, this layer should also make the action order explicit:

- when a new goal arrives and the plan is blank, write the current goal and first single-owner subfunctions first
- do not default to implementing worker-owned scope in the supervisor thread
- route engineering work to `engineer` and art work to `art_asset_producer` unless the human explicitly changes the owner

Do not put today's milestone details or temporary implementation notes here.

### 4. Durable project docs under `docs/`

Put larger or faster-changing operational knowledge here:

- structured agent communication protocol
- engineering standards
- delivery ledger or current-plan ledger
- development loop
- thread conversation protocol
- work order and handoff templates
- architecture docs
- debug workflow docs

These docs are large enough, or change often enough, that they should stay out of role-local `AGENTS.md`.

### 5. The initialization message

The startup message sent after thread creation should do only a few things:

- remind the agent that the loaded instruction chain is primary
- point it at a small, read-only set of authority docs that already exist on disk
- make the structured communication protocol authoritative for later coordination if that doc exists
- ask it to summarize the stable facts it just learned
- confirm readiness with a deterministic token

It should not become a hidden second source of truth.

## Coordex template rules

For the default `game-development` template, Coordex should generate:

- root project `AGENTS.md`: owned by the project, not by Coordex
- `Agents/AGENTS.md`: shared visible-role coordination rules
- `Agents/supervisor/AGENTS.md`: planning, routing, acceptance, and coordination charter
- `Agents/engineer/AGENTS.md`: architecture, implementation, debug, and technical handoff charter
- `Agents/art_asset_producer/AGENTS.md`: asset planning, output packaging, and art handoff charter

Coordex should also send a read-only startup prompt that asks the agent to read only a small doc set relevant to that role if those files exist.

## SlgGame mapping

Using `SlgGame` as the concrete reference, the correct split is:

- root `AGENTS.md`
  - project identity
  - stage and milestone framing
  - stack summary such as `Cocos Creator + TypeScript` and `Go + Hollywood`
  - authority order
  - protected directories
  - supervisor-started visible-thread model with structured peer coordination inside active tasks

- role-local `AGENTS.md`
  - `supervisor`: owns planning, routing, human communication, and final acceptance
  - `engineer`: owns architecture, implementation, integration, debugging, and technical validation
  - `art_asset_producer`: owns visual asset decomposition, generation workflow, naming discipline, and handoff packaging

- project docs
  - `docs/process/engineering-standards.md`
  - `docs/process/structured-agent-communication-protocol.md`
  - `docs/process/development-loop.md`
  - `docs/project/delivery-ledger.md`
  - `docs/process/thread-conversation-protocol.md`
  - `docs/project/thread-conversation-ledger.md`
  - `docs/templates/supervisor-work-order-template.md`
  - `docs/templates/worker-handoff-template.md`
  - `docs/templates/thread-message-template.md`
  - `docs/process/dedicated-browser-workflow.md`
  - `docs/process/cocos-mcp-workflow.md`
  - `docs/architecture/client-structure.md`
  - `docs/architecture/server-structure.md`

This is enough for a new role thread to learn the project without replaying the full project history.

## Practical rule of thumb

When deciding where a piece of knowledge belongs, use this check:

- if it should survive across many prompts and many tasks, put it in `AGENTS.md` or a durable doc
- if it is role-specific but stable, put it in the role directory `AGENTS.md`
- if it changes with milestones, plans, or execution state, put it in a ledger, plan doc, or feature doc
- if it matters only for this one startup, put it in the initialization message

If a role needs the same missing fact more than once, that fact should be written back into the durable project docs.
