# Visible Multi-Agent Operating Model

This document records the multi-agent model that is currently confirmed for Coordex.

It separates what is already validated from what is still future product work.

## Core idea

Coordex is not trying to hide collaboration behind opaque project-level subthreads.

The confirmed model is:

- one human operator stays in the loop
- each important role has a visible Codex conversation
- role context is shaped primarily by working directory and `AGENTS.md` inheritance
- durable role agents are managed as project assets, not just as disposable chats

## Why visible role threads

Coordex uses visible role chats instead of hidden subthreads for practical reasons:

- hidden internal worker state is harder for the operator to inspect
- long-running or noisy workers can stall without leaving readable context
- role ownership is easier to reason about when each role is a named conversation
- manual operator control is slower, but more stable and more auditable

This remains a product rule, not a temporary workaround.

## Confirmed thread types

### 1. Root chats

Root chats are temporary project-root conversations.

Properties:

- start in `projectRoot/`
- inherit only the instruction files on the path down to the project root working directory
- are not part of the durable role roster
- are suitable for general coordination, exploration, and temporary tasks

### 2. Durable role agents

Durable role agents are the main multi-agent unit in Coordex.

Properties:

- start in `projectRoot/Agents/<role>/`
- are intended to remain visible and reusable across sessions
- are synchronized in three places at once:
  - the local role directory under `Agents/<role>/`
  - the real Codex thread whose `cwd` is that directory
  - the project-level role roster block in the root `AGENTS.md`

### 3. Imported descendant chats

Imported descendant chats are existing Codex threads discovered under the project root by `cwd` prefix.

Properties:

- they may live in the project root or deeper child directories
- Coordex can read and display them when thread discovery finds them
- they are useful for validation and recovery
- they are not yet the same thing as durable role agents

## Confirmed instruction-loading model

Coordex relies on the official Codex `AGENTS.md` discovery behavior.

For a role thread started in `projectRoot/Agents/<role>/`, the intended instruction chain is:

- project root `AGENTS.md`
- `Agents/AGENTS.md`
- `Agents/<role>/AGENTS.md`

For a root chat started in `projectRoot/`, the intended instruction chain is just the project-root path down to that working directory.

This model has already been validated locally in two ways:

- direct Codex session validation with the `CodexTest3` repo and `inner/AGENTS.md`
- Coordex ingestion of `CodexTest3` threads, where:
  - the root chat returned only `ROOT_CHAIN_TOKEN_4F72`
  - the `inner` chat returned both `ROOT_CHAIN_TOKEN_4F72` and `INNER_CHAIN_TOKEN_9C31`

Related validation doc:

- [AGENTS Root Discovery Validation](/Users/mawei/MyWork/coordex/docs/process/agents-root-discovery-validation.md)

## Confirmed initialization layering

Coordex should not push all project knowledge into a one-off startup prompt.

The confirmed layering is:

- project root `AGENTS.md` for stable project identity, stack summary, authority order, and cross-role rules
- `Agents/AGENTS.md` for shared role-space behavior
- `Agents/<role>/AGENTS.md` for stable role charter, role-owned responsibilities, default inputs, and handoff rules
- durable project docs under `docs/` for larger or faster-changing operating knowledge such as ledgers, templates, workflows, and architecture notes
- a short initialization prompt only for read-only startup guidance and ready confirmation

Related design doc:

- [Agent Initialization Model](/Users/mawei/MyWork/coordex/docs/architecture/agent-initialization-model.md)

## Role responsibilities

The current confirmed role split is simple and operator-driven.

### Human operator

- creates or selects projects
- creates agents
- decides which role should start an active subfunction
- opens the relevant visible conversation
- decides whether to send a task prompt
- reviews progress and keeps the loop under supervision

### Supervisor

- owns product goals, milestone planning, and project-level coordination
- records the current goal and first single-owner subfunctions before implementation starts when the plan is blank
- breaks work into role-owned tasks
- decides which role should start each task
- does not self-execute engineer-owned or art-owned implementation by default when a matching worker role exists
- tracks completion, cross-role handoff, and final acceptance decisions
- remains the authority for scope changes, priority changes, and acceptance even when peers coordinate directly during execution

### Worker roles

- act on a narrower slice of context
- focus on their assigned responsibility instead of the full project history
- return results into their own visible thread
- may coordinate directly with another role during an active subfunction if the coordination stays inside that subfunction's scope
- should use the structured protocol in `docs/process/structured-agent-communication-protocol.md` when that doc exists

### Engineer

- owns technical architecture, implementation, integration, debugging, and technical validation
- reports technical completion, risks, and remaining blockers back into the visible thread

### Independent verifier roles

- are optional, not part of the default `game-development` template
- may be added later for adversarial checks or independent review
- do not replace the supervisor's final product-acceptance responsibility

## Why partial context is intentional

The model is not "every role reads everything."

The current operating assumption is:

- shared project identity belongs at the root
- shared role-space rules belong in `Agents/`
- role-specific constraints belong in the role directory
- most roles should work from partial context unless broader context is explicitly needed

This keeps role prompts smaller and more stable than forcing every role to replay the entire project history.

## Confirmed synchronization rule

For durable role agents, Coordex must keep these three artifacts aligned:

- filesystem directory
- Codex thread
- project-level roster in root `AGENTS.md`

If one of these drifts, the role model becomes harder to inspect and less trustworthy.

This synchronization rule is already part of the product contract.

## Confirmed current limitations

These are current product limits, not design goals:

- Coordex can directly create project-root chats
- Coordex can directly create role agents under `Agents/<role>/`
- Coordex does not yet provide a first-class UI flow for creating an ordinary non-agent chat in an arbitrary child directory such as `projectRoot/inner/`
- zero-turn threads may exist before `thread/list` starts returning them
- official Codex project views may omit descendant role threads even when Coordex can read them by `cwd`

## What Coordex should rely on

At this stage, the stable design assumptions are:

- browser validation must use the dedicated Chrome workflow
- visible role chats are the primary collaboration surface
- durable role agents live under `Agents/<role>/`
- root chats remain temporary and separate from the durable role roster
- project thread grouping is derived from `cwd` under the registered root
- role instruction inheritance is directory-based and should not be flattened away in the UI or data model

## Related docs

- [README.md](/Users/mawei/MyWork/coordex/README.md)
- [AGENTS.md](/Users/mawei/MyWork/coordex/AGENTS.md)
- [Structured Agent Communication Protocol](/Users/mawei/MyWork/coordex/docs/process/structured-agent-communication-protocol.md)
- [Dedicated Browser Workflow](/Users/mawei/MyWork/coordex/docs/process/dedicated-browser-workflow.md)
- [AGENTS Root Discovery Validation](/Users/mawei/MyWork/coordex/docs/process/agents-root-discovery-validation.md)
