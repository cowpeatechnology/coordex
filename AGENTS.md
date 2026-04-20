# Coordex Operating Manual

This file is the primary project charter for `Coordex`.

`Coordex` is a standalone local coordination console for Codex. It is not game-specific, even if it was first incubated inside another repository.

## 1. Project identity

- Project: `Coordex`
- Purpose: provide a browser-based coordination surface over Codex threads, local workspace roots, and role-oriented chat workflows
- Current form: local-first desktop companion web app
- Primary user model: one human operator managing visible Codex conversations across one or more local workspaces

## 2. Core product intent

Coordex exists to support a visible, inspectable workflow instead of opaque project-level subthreads.

Origin rationale:

- Hidden project-level subthreads were too black-box for the operator.
- Long-running or log-heavy worker activity could wedge and leave the supervisor waiting on unclear internal state.
- The operator wanted durable, human-readable coordination history across role conversations instead of fragmented or hidden context.
- Manual switching between visible chats was accepted as a deliberate tradeoff for stability, traceability, and operator control.
- Role collaboration should be readable as named conversations, not only as internal agent orchestration.
- Coordex exists to make that workflow practical on top of Codex, not to replace Codex itself.

The intended operator experience is:

- bind one or more local filesystem roots as Coordex projects
- view the Codex threads that already belong to those roots
- create new root chats and role-specific chats in predictable directories
- reopen the web UI and resume from the last selected project/chat
- keep project coordination readable without losing direct access to each underlying Codex conversation

Important product distinction:

- A Coordex `project` is currently local metadata bound to a filesystem root.
- It is **not** an official Codex-native `Project` object exposed by app-server.
- Thread discovery is currently inferred from Codex thread `cwd` values.
- For current product language and sync behavior, treat the official Codex app's thread "delete" action as archive semantics unless app-server exposes a true hard-delete capability.

Do not blur that distinction in code or docs.

## 3. Authority order

Resolve conflicts in this order:

1. Direct user instruction
2. This `AGENTS.md`
3. `README.md`
4. The current codebase and tests

If a required policy is missing, add it here or document it in `README.md`. Do not invent hidden rules.

## 4. Architecture snapshot

Current implementation:

- frontend: React + Vite
- local bridge: Node + Express
- backend integration: `codex app-server` over stdio JSON-RPC
- persistence: local JSON state under `~/.coordex/state.json`

Current runtime behavior:

- dev web default: `http://localhost:4173`
- local API default: `http://localhost:4318`
- auth source: Codex app-server `account/read`
- thread discovery source: Codex app-server `thread/list`
- thread read source: Codex app-server `thread/read`
- chat creation source: Codex app-server `thread/start`
- message send source: Codex app-server `turn/start`

Current project layout:

- `src/client/`: React UI
- `src/server/`: Express bridge and Codex app-server integration
- `src/shared/`: shared types and agent template metadata
- `templates/`: reusable project bootstrap and role-template sources

## 5. Non-negotiable product rules

- Keep Coordex local-first. Do not introduce remote infrastructure unless the user explicitly asks for it.
- Do not claim access to Codex-native global projects unless app-server actually exposes that capability and the code uses it.
- Do not hide project-level coordination behind black-box worker orchestration as the primary workflow.
- Do not bootstrap multi-layer `AGENTS.md` and project-scoped `.codex` behavior into a target tree until the target root has a real project-root marker. The current safe Coordex rule is: if the target root has no `.git`, establish one with `git init` before project registration or role creation.
- Do not treat the dedicated Chrome workflow as optional. Browser validation for this repo is only valid when attached to the fixed dedicated Chrome instance documented in `docs/process/dedicated-browser-workflow.md`.
- Do not couple Coordex to a specific game, repo, or domain in product language or architecture.
- Do not let UI polish break the core workflows: auth, project binding, thread discovery, chat creation, resume, and message sending.
- Do not treat temporary browser artifacts or screenshots as repository source files.
- Do not assume the browser UI is the only client; the underlying data flow should stay explicit and debuggable.

## 6. Current feature boundaries

Supported today:

- local project registration
- project registration seeds missing files from an internal project template under `templates/`, plus a synced Coordex workflow block in the target root `AGENTS.md`
- Codex auth status read and ChatGPT login start
- project-scoped thread discovery by `cwd` prefix
- root chat creation
- automatic root-chat initialization immediately after chat creation, with success gated on receiving the first assistant reply
- agent chat creation under `projectRoot/Agents/<role>/`
- role creation also seeds durable role-state files under `docs/project/role-state/` for the created role
- automatic role-thread initialization immediately after agent creation, with success gated on receiving the first assistant reply
- last-selection restore
- thread viewing
- plain-text message sending
- resizable left/right layout in the web UI

Known limits that must stay visible in docs and planning:

- no approvals UI yet
- because approvals are not surfaced in the browser, Coordex-managed threads currently use `danger-full-access` plus `never` approval when started, resumed, or sent a turn through app-server
- no official Codex project discovery API integration
- thread discovery is heuristic, based on `cwd`
- Coordex-created agents are auto-initialized during creation, but externally created or interrupted zero-turn role threads may still be readable by `thread/read` before `thread/list` starts returning them
- even after activation, role threads started under `Agents/<role>/` may still be absent from the official Codex project view because app-server does not expose a project-scoped descendant-thread API or durable thread-to-project binding that Coordex can reuse
- no multi-user or remote sync model
- no write-time migration helpers for existing role directories yet

## 7. Agent and role conventions

Coordex supports project-template-driven role creation.

The confirmed operating model is documented in [docs/architecture/visible-multi-agent-operating-model.md](/Users/mawei/MyWork/coordex/docs/architecture/visible-multi-agent-operating-model.md).

Current default role layout:

- root directory: `Agents/`
- default template: `2d-cocos-creator-game-development`
- default roles:
  - `supervisor`
  - `engineer`
  - `art_asset_producer`
- default responsibility split:
  - `supervisor` owns product direction, milestone planning, task routing, and final acceptance
  - `engineer` owns technical architecture, implementation, integration, and technical validation

Role creation rules:

- role directories should use stable English names
- role chats should start in `projectRoot/Agents/<role>/`
- before any role thread is created, the target root should already be a real Codex-detectable project root; for current Coordex practice, require `git init` at the target root if `.git` does not exist
- agent creation is a three-way sync operation across the role directory, the Codex thread started in that directory, and the generated role roster block in the project root `AGENTS.md`
- agent creation should also ensure the durable per-role state file exists under `docs/project/role-state/<role>.md`
- role creation is not complete until Coordex has sent the initialization prompt and received the first assistant reply for that role thread
- role threads must start in `projectRoot/Agents/<role>/` so Codex loads the project root `AGENTS.md`, then `Agents/AGENTS.md`, then the role-local `AGENTS.md`
- `Agents/AGENTS.md` may define shared role-space behavior
- per-role local instructions should live in `Agents/<role>/AGENTS.md`
- stable project facts belong in the project root `AGENTS.md` or durable project docs, not only in an initialization prompt
- project registration should ensure a project-scoped `.codex` SessionStart reminder layer exists unless the project already defines its own files
- threads first created before the target root had a valid project-root marker must be treated as contaminated for inheritance validation; the safe recovery path is to archive and recreate them after `git init`
- direct peer coordination is allowed only inside an already active subfunction; task start, major scope changes, and acceptance still belong to the supervisor or human
- role-to-role and role-to-supervisor coordination should use the structured contract documented in [docs/process/structured-agent-communication-protocol.md](/Users/mawei/MyWork/coordex/docs/process/structured-agent-communication-protocol.md) instead of drifting into unconstrained prose
- role-specific mission, ownership, and handoff rules belong in `Agents/<role>/AGENTS.md`
- reusable bootstrap docs, role handbooks, SessionStart hook content, and root `AGENTS.md` workflow blocks belong under `templates/<template-key>/`, not as hardcoded strings in Coordex application logic
- avoid `AGENTS.override.md` unless same-directory replacement semantics are explicitly required
- the initialization prompt should only bootstrap the role by pointing it at the already-loaded instruction chain plus a small read-only authority-doc set, then confirm readiness
- root chats are temporary project-root conversations and are not part of the durable role roster
- visible role chats are the primary collaboration surface; root chats are for temporary project-wide conversations
- imported descendant chats may be read into a project by `cwd` prefix, but they are not the same product concept as durable role agents

## 8. Documentation discipline

When updating docs:

- keep standalone Coordex language
- separate current behavior from future aspirations
- note when something is derived from app-server limitations rather than product choice
- document local paths, runtime assumptions, and persistence locations explicitly
- prefer small, durable docs over speculative roadmaps

If moving this repo into a clean standalone directory, preserve:

- this `AGENTS.md`
- `README.md`
- the current run/build commands
- the distinction between Coordex-local metadata and Codex-native thread state

## 9. Development discipline

- Prefer small, reviewable changes over broad rewrites.
- Preserve working local auth and thread flows while iterating on UI.
- Verify with `npm run build` after meaningful changes.
- For UI changes, inspect the rendered page in a browser instead of relying only on source review.
- Browser validation for this repo must follow [docs/process/dedicated-browser-workflow.md](/Users/mawei/MyWork/coordex/docs/process/dedicated-browser-workflow.md).
- When validating a target project through Coordex, follow [docs/process/template-validation-test-rules.md](/Users/mawei/MyWork/coordex/docs/process/template-validation-test-rules.md) and simulate a real human operator rather than coaching the target project's roles out of band.
- During template validation, only provide the target supervisor with product or feature requirements. Do not inject project workflow rules, board-format rules, communication rules, browser-debugging rules, or other template-owned behavior by chat.
- If a validation run needs extra coaching about rules that should have come from the generated files or SessionStart reminder layer, treat that as a template failure, not a passing run.
- Keep integration logic in the server layer explicit; avoid burying app-server assumptions inside UI code.
- Treat `output/` as disposable local artifacts, not source.
- Apply the code-vs-template boundary on every multi-agent bug or workflow bug:
  - if the issue is in UI, thread lifecycle, synchronization, parsing, persistence, browser validation, or any Coordex-owned runtime data surface, fix Coordex product code
  - if the issue is that a role misunderstood its charter, wrote the wrong plan format, followed the wrong coordination protocol, or lost a durable workflow rule after compaction or resume, fix the template files or template hook content instead of hardcoding a behavior patch into Coordex
  - if the issue exists only in one live project's current state, fix that project's runtime docs or state first, then decide whether the reusable template source also needs the same improvement
- Do not patch Coordex application code merely to compensate for a weak role template.
- Do not leave a reusable template-side fix only inside one live project; if the fix should apply to future projects, propagate it back into Coordex's template source.
- Keep the deeper rationale in [docs/architecture/coordex-code-vs-template-boundary.md](/Users/mawei/MyWork/coordex/docs/architecture/coordex-code-vs-template-boundary.md), but treat the rules above as the always-on operating default for this repo.

## 10. Practical defaults

- If a task changes UX structure, keep the left-side coordination controls stable and the right-side chat view focused.
- If a task adds a new Coordex concept, define whether it is local metadata, Codex-native state, or derived state.
- If a task proposes automation or agents, bias toward visible operator control.
- If a task would make Coordex repo-specific, stop and reframe it as a generic capability unless the user explicitly wants specialization.

## Coordex Agent Roles

<!-- COORDEX:AGENT-ROSTER:START -->
This block is maintained by Coordex and keeps active role agents aligned across the local role directories under `Agents/`, the Codex threads started from those directories, and this project-level roster.

Agent threads should start in `Agents/<role>/` so Codex loads instructions from the project root down to the role directory: this `AGENTS.md`, then `Agents/AGENTS.md`, then `Agents/<role>/AGENTS.md`.

Root chats created from Coordex remain project-root conversations and are intentionally excluded from this role roster.

| Role | Directory | Thread | Responsibility |
| --- | --- | --- | --- |
| _None yet_ | — | — | No role agents have been created from Coordex yet. |

<!-- COORDEX:AGENT-ROSTER:END -->
