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

## 5. Non-negotiable product rules

- Keep Coordex local-first. Do not introduce remote infrastructure unless the user explicitly asks for it.
- Do not claim access to Codex-native global projects unless app-server actually exposes that capability and the code uses it.
- Do not hide project-level coordination behind black-box worker orchestration as the primary workflow.
- Do not couple Coordex to a specific game, repo, or domain in product language or architecture.
- Do not let UI polish break the core workflows: auth, project binding, thread discovery, chat creation, resume, and message sending.
- Do not treat temporary browser artifacts or screenshots as repository source files.
- Do not assume the browser UI is the only client; the underlying data flow should stay explicit and debuggable.

## 6. Current feature boundaries

Supported today:

- local project registration
- Codex auth status read and ChatGPT login start
- project-scoped thread discovery by `cwd` prefix
- root chat creation
- agent chat creation under `projectRoot/Agents/<role>/`
- last-selection restore
- thread viewing
- plain-text message sending
- resizable left/right layout in the web UI

Known limits that must stay visible in docs and planning:

- no approvals UI yet
- no official Codex project discovery API integration
- thread discovery is heuristic, based on `cwd`
- no multi-user or remote sync model
- no write-time migration helpers for existing role directories yet

## 7. Agent and role conventions

Coordex supports project-template-driven role creation.

Current default role layout:

- root directory: `Agents/`
- default template: `game-development`
- default roles:
  - `supervisor`
  - `engineer`
  - `art_asset_producer`
  - `qa_verifier`

Role creation rules:

- role directories should use stable English names
- role chats should start in `projectRoot/Agents/<role>/`
- `Agents/AGENTS.md` may define shared role-space behavior
- per-role local instructions should live in `AGENTS.override.md`

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
- Keep integration logic in the server layer explicit; avoid burying app-server assumptions inside UI code.
- Treat `output/` as disposable local artifacts, not source.

## 10. Practical defaults

- If a task changes UX structure, keep the left-side coordination controls stable and the right-side chat view focused.
- If a task adds a new Coordex concept, define whether it is local metadata, Codex-native state, or derived state.
- If a task proposes automation or agents, bias toward visible operator control.
- If a task would make Coordex repo-specific, stop and reframe it as a generic capability unless the user explicitly wants specialization.
