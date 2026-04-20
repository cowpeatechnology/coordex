# Coordex

Coordex is a local coordination console for Codex.

This first version is intentionally narrow:

- verify Codex authentication state from a local web UI
- create local projects bound to filesystem roots
- discover existing Codex threads for a project root
- create new chats backed by real Codex threads
- create role agents that start inside `projectRoot/Agents/<role>/`
- initialize new root chats immediately after thread creation and wait for the first assistant reply before treating them as visible and stable
- initialize new role agents by bootstrapping their persistent instruction layers plus a small read-only startup doc set, then wait for the first assistant reply before treating them as ready
- reopen the web UI and restore the last selected project/chat
- send a plain text message into the selected chat

It exists to support visible, role-oriented coordination for local Codex workspaces without relying on opaque project-level subthreads.

## Project bootstrap package

When a local filesystem root is first registered as a Coordex project, Coordex now bootstraps a minimal checked-in methodology package from an internal template directory if the files do not already exist.

The intent is not to invent project truth automatically. The intent is to make a brand new project immediately usable with visible role coordination instead of leaving every project to rediscover the same scaffolding from scratch.

The default template currently lives under `templates/game-development/`.

Bootstrap prerequisite:

- before Coordex registers a project or creates any role threads under it, the target root should already have a real project-root marker
- the current safe Coordex rule is to require `.git` at the target root and run `git init` first when it is missing
- do not rely on a user-specific global `project_root_markers` override in `~/.codex/config.toml` as the product baseline
- if role threads were first created before that Git root existed, treat those old threads as contaminated and recreate them after `git init`

Coordex copies or syncs missing versions of:

- root `AGENTS.md`
- `.codex/config.toml`
- `.codex/hooks.json`
- `.codex/hooks/session-start-context.mjs`
- `.coordex/current-plan.md`, `.coordex/plan-history.md`, and `.coordex/project-board.json`
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

Role-state files under `docs/project/role-state/` are part of the template baseline for default roles. When a custom role agent is created, Coordex adds a matching missing role-state file from the selected template's custom-role scaffold so durable role-local working state has a canonical on-disk location instead of drifting back into chat history.

Important constraints:

- Coordex only writes files that are missing. It does not overwrite an existing project's docs.
- The template files are scaffolding, not authoritative product truth.
- The human still needs to fill in real project identity, stack, directories, debug path, and current goal.
- The supervisor remains responsible for drafting the real current plan before dispatching implementation work.
- In the default operating model, the supervisor should not swallow worker-owned implementation itself; it should plan first and route engineer or art work to the matching role.

## Agent synchronization model

Coordex treats a durable role agent as one thing that is reflected in three places at once:

- a local role directory under `projectRoot/Agents/<role>/`
- a real Codex thread started with that directory as its `cwd`
- a generated role roster block in the project root `AGENTS.md`

This is deliberate. According to the official Codex `AGENTS.md` guidance, Codex loads instructions from the project root down to the current working directory. Coordex now uses plain role-local `AGENTS.md` files by default and reserves `AGENTS.override.md` only for rare same-directory replacement cases. That means a thread started in `projectRoot/Agents/<role>/` normally inherits:

- the project root `AGENTS.md`
- `Agents/AGENTS.md`
- `Agents/<role>/AGENTS.md`

Coordex relies on that hierarchy so each role thread automatically sees the project-level identity and shared role roster before it sees its own local role instructions. Root chats are different: they start in the project root, remain temporary project conversations, and are not part of the durable role roster.

That inheritance depends on Codex actually recognizing the target root as the project root. In the verified local tests, the reliable baseline was an actual Git root. Without `.git`, child-directory sessions could fall back to treating the current directory as the effective root, which prevented the project root `AGENTS.md` and root `.codex` layer from being inherited.

Official references:

- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [Codex best practices](https://developers.openai.com/codex/learn/best-practices)
- [Local validation of root and child `AGENTS.md` loading](/Users/mawei/MyWork/coordex/docs/process/agents-root-discovery-validation.md)
- [Visible multi-agent operating model](/Users/mawei/MyWork/coordex/docs/architecture/visible-multi-agent-operating-model.md)
- [Agent initialization model](/Users/mawei/MyWork/coordex/docs/architecture/agent-initialization-model.md)
- [Coordex code vs template boundary](/Users/mawei/MyWork/coordex/docs/architecture/coordex-code-vs-template-boundary.md)
- [Project bootstrap package](/Users/mawei/MyWork/coordex/docs/architecture/project-bootstrap-package.md)
- [Structured agent communication protocol](/Users/mawei/MyWork/coordex/docs/process/structured-agent-communication-protocol.md)
- [Context retention after compaction](/Users/mawei/MyWork/coordex/docs/process/context-retention-after-compaction.md)
- [Template validation test rules](/Users/mawei/MyWork/coordex/docs/process/template-validation-test-rules.md)
- [Reset a project to a clean agent-free test state](/Users/mawei/MyWork/coordex/docs/process/reset-to-clean-agent-state.md)

## Why Coordex exists

Coordex was started to address a few practical workflow problems:

- hidden project-level subthreads felt too opaque for the operator
- long-running or log-heavy internal worker flows could stall in ways that were hard to inspect
- role collaboration needed a durable, readable conversation surface instead of scattered hidden context
- manually switching between visible chats was considered an acceptable tradeoff for control, stability, and traceability

In short: Coordex is meant to make Codex coordination more inspectable and operator-driven, not more magical.

Important distinction:

- a Coordex `project` is currently local metadata bound to a filesystem root
- it is not an official Codex-native global project object
- existing threads are discovered by matching thread `cwd` under a registered root
- when the official Codex app says a thread was "deleted", Coordex currently treats that as an archived thread and removes it from the active project view on the next sync

## Stack

- React + Vite frontend
- Node + Express local bridge
- `codex app-server` over stdio JSON-RPC
- local JSON persistence under `~/.coordex/state.json`

## Run

```bash
npm install
npm run dev
```

Then open the local Vite URL, usually `http://localhost:4173`.

Browser debugging note:

- Coordex browser validation uses the dedicated Chrome workflow described in [docs/process/dedicated-browser-workflow.md](/Users/mawei/MyWork/coordex/docs/process/dedicated-browser-workflow.md)
- The dedicated Chrome requirement is a hard constraint, not a preference. Do not treat default-browser auto-connect flows as valid browser verification for this project.

## Current scope

- Auth: reads current Codex account state and can start ChatGPT login
- Projects: local metadata only, bound to a filesystem root
- Project bootstrap: registering a project seeds missing files from the selected internal template plus the root `AGENTS.md` workflow block for that root
- Chats: local metadata mapped to Codex thread ids
- Agents: project-template-driven role creation under `projectRoot/Agents/<role>/`
- Agent creation: synchronizes the role directory, the role thread, and the generated project-level roster in root `AGENTS.md`
- Root chat initialization: Coordex sends a short no-tools initialization prompt immediately after creating the root thread and waits for a real assistant reply before the chat is considered active
- Agent initialization: Coordex sends a constrained read-only startup prompt after creating the role thread so the agent confirms its loaded instruction chain, reads a small set of stable authority docs if they exist, and then reports readiness
- Role-state scaffolding: the template baseline seeds default role-state files, and custom role creation adds a matching missing `docs/project/role-state/<role>.md` from the selected template scaffold
- Agent coordination contract: the durable source of truth for agent-to-agent and agent-to-supervisor messaging should be the structured protocol in `docs/process/structured-agent-communication-protocol.md`, with fixed field names and enums rather than freeform prose
- Restore: persists last selected project and chat
- Layout: fixed project controls on the left, focused chat view on the right, resizable divider in between

## Known limits

- This version does not implement approvals UI
- Until approvals UI exists, Coordex-created and Coordex-resumed threads run with `danger-full-access` sandbox and `never` approval so browser-driven workflows do not deadlock on hidden approval prompts
- Today, the safe bootstrap rule is documented but not yet fully enforced by product code: if a target root lacks `.git`, establish it before trusting multi-layer `AGENTS.md` and project-scoped `.codex` inheritance
- Thread discovery is prefix-based on thread `cwd`, so project roots work best when chats are opened from that root or its subdirectories
- Coordex-created root chats are auto-initialized so they do not remain in a zero-turn pending state under normal creation flow
- Coordex-created agent threads are auto-initialized so they do not remain in a zero-turn pending state under normal creation flow
- Even after activation, role threads started under `Agents/<role>/` may still be absent from the official Codex project view; Coordex groups by root-path prefix, while the official app does not currently expose a project-scoped descendant-thread API or durable thread-to-project binding that Coordex can reuse

See [thread-permissions-and-approvals.md](/Users/mawei/MyWork/coordex/docs/process/thread-permissions-and-approvals.md) for the current execution policy and app-server field mapping.
