# Coordex

Coordex is a local coordination console for Codex.

This first version is intentionally narrow:

- verify Codex authentication state from a local web UI
- create local projects bound to filesystem roots
- discover existing Codex threads for a project root
- create new chats backed by real Codex threads
- create role agents that start inside `projectRoot/Agents/<role>/`
- reopen the web UI and restore the last selected project/chat
- send a plain text message into the selected chat

It exists to support visible, role-oriented coordination for local Codex workspaces without relying on opaque project-level subthreads.

Important distinction:

- a Coordex `project` is currently local metadata bound to a filesystem root
- it is not an official Codex-native global project object
- existing threads are discovered by matching thread `cwd` under a registered root

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

## Current scope

- Auth: reads current Codex account state and can start ChatGPT login
- Projects: local metadata only, bound to a filesystem root
- Chats: local metadata mapped to Codex thread ids
- Agents: project-template-driven role creation under `projectRoot/Agents/<role>/`
- Restore: persists last selected project and chat
- Layout: fixed project controls on the left, focused chat view on the right, resizable divider in between

## Known limits

- This version does not implement approvals UI
- New chats default to `workspace-write` sandbox and `never` approval to avoid blocking on unhandled approval requests
- Thread discovery is prefix-based on thread `cwd`, so project roots work best when chats are opened from that root or its subdirectories
