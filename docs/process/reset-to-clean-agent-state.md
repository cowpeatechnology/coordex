# Reset to Clean Agent State

Use this process when you want to keep ordinary project chats, but remove all durable agent artifacts and project-board state before running a fresh internal workflow test.

This document records the correct cleanup order for the current Coordex architecture.

## What must be cleaned

For a project that previously created agents from Coordex, the clean reset is not just one delete.

The following layers must be brought back into sync:

- the real Codex agent threads
- the Coordex local chat metadata in `~/.coordex/state.json`
- the project `Agents/` directory
- the project root `AGENTS.md` roster block
- the project-local board files under `.coordex/`

If you skip the real Codex thread archive step, the old agent threads can be re-imported on the next sync.

## Intended result

After a successful reset:

- ordinary root chats remain available
- agent chats are gone from Coordex
- `Agents/` no longer exists under the project root
- the root `AGENTS.md` roster shows `_None yet_`
- `.coordex/` may be recreated later by the server, but only as a blank initial board

## Before you start

- Replace the example `PROJECT_ROOT` with the actual project you want to clean.
- Stop `npm run dev` first, or plan to restart it after cleanup so the UI does not keep stale in-memory state.
- Back up `~/.coordex/state.json` if you want an easy rollback.

Example root:

```bash
export PROJECT_ROOT=/Users/mawei/MyWork/coordex
```

## Step 1: back up local state

```bash
mkdir -p /tmp/coordex-cleanup-backup
cp ~/.coordex/state.json /tmp/coordex-cleanup-backup/state.json.bak
cp "$PROJECT_ROOT/AGENTS.md" /tmp/coordex-cleanup-backup/project-AGENTS.md.bak
test -d "$PROJECT_ROOT/Agents" && cp -R "$PROJECT_ROOT/Agents" /tmp/coordex-cleanup-backup/Agents.bak
test -d "$PROJECT_ROOT/.coordex" && cp -R "$PROJECT_ROOT/.coordex" /tmp/coordex-cleanup-backup/project-board.bak
```

## Step 2: inspect the current project entry and agent threads

This prints the registered project and only its agent chats.

```bash
python3 - <<'PY'
import json, pathlib, os

project_root = os.environ["PROJECT_ROOT"]
state = json.loads(pathlib.Path.home().joinpath(".coordex", "state.json").read_text())
project = next((p for p in state["projects"] if p["rootPath"] == project_root), None)

if not project:
    raise SystemExit(f"Project not found in ~/.coordex/state.json: {project_root}")

agents = [
    {
        "chatId": chat["id"],
        "threadId": chat["threadId"],
        "title": chat["title"],
        "cwd": chat["cwd"],
    }
    for chat in state["chats"]
    if chat["projectId"] == project["id"] and chat["kind"] == "agent"
]

print(json.dumps({"project": project, "agents": agents}, ensure_ascii=False, indent=2))
PY
```

## Step 3: archive the real Codex agent threads

This step is mandatory.

Deleting only the local Coordex metadata is not enough, because `codex app-server` can re-list those threads later.

If any agent thread is still running or stuck in `waitingOnApproval`, interrupt the active turn first and then archive the thread. Archiving without interrupting can leave the cleanup order harder to reason about.

The following script:

- reads the agent `threadId` list for the target project from `~/.coordex/state.json`
- calls `codex app-server`
- sends `turn/interrupt` for any in-progress turn it finds
- sends `thread/archive` for each agent thread

```bash
node <<'EOF'
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const readline = require("node:readline");

const projectRoot = process.env.PROJECT_ROOT;
if (!projectRoot) {
  throw new Error("PROJECT_ROOT is required.");
}

const statePath = path.join(os.homedir(), ".coordex", "state.json");
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const project = state.projects.find((entry) => entry.rootPath === projectRoot);
if (!project) {
  throw new Error(`Project not found in ${statePath}: ${projectRoot}`);
}

const threadIds = state.chats
  .filter((chat) => chat.projectId === project.id && chat.kind === "agent")
  .map((chat) => chat.threadId);

if (!threadIds.length) {
  console.log("No agent threads to archive.");
  process.exit(0);
}

let nextId = 1;
const pending = new Map();
const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
  stdio: ["pipe", "pipe", "pipe"],
  env: process.env,
});

const rl = readline.createInterface({ input: child.stdout });

function write(message) {
  child.stdin.write(`${JSON.stringify(message)}\n`);
}

function request(method, params) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    write({ jsonrpc: "2.0", id, method, params });
  });
}

rl.on("line", (line) => {
  const trimmed = line.trim();
  if (!trimmed) return;
  const msg = JSON.parse(trimmed);
  if (!Object.prototype.hasOwnProperty.call(msg, "id")) return;
  const req = pending.get(msg.id);
  if (!req) return;
  pending.delete(msg.id);
  if (msg.error) req.reject(new Error(msg.error.message));
  else req.resolve(msg.result);
});

child.stderr.on("data", (chunk) => {
  const text = chunk.toString().trim();
  if (text) process.stderr.write(`${text}\n`);
});

child.on("exit", (code, signal) => {
  for (const req of pending.values()) {
    req.reject(new Error(`codex app-server exited (${code}, ${signal})`));
  }
  pending.clear();
});

(async () => {
  await request("initialize", {
    clientInfo: {
      name: "coordex_cleanup",
      title: "Coordex Cleanup",
      version: "0.1.0",
    },
  });
  write({ jsonrpc: "2.0", method: "initialized", params: {} });

  for (const threadId of threadIds) {
    const thread = await request("thread/read", { threadId, includeTurns: true });
    const activeTurn = thread.thread.turns.find((turn) => turn.status === "inProgress");
    if (activeTurn) {
      await request("turn/interrupt", { threadId, turnId: activeTurn.id });
      console.log(`Interrupted ${activeTurn.id} on ${threadId}`);
    }

    await request("thread/archive", { threadId });
    console.log(`Archived ${threadId}`);
  }

  child.kill();
})().catch((error) => {
  console.error(error.stack || String(error));
  child.kill();
  process.exit(1);
});
EOF
```

## Step 4: remove local agent metadata from `~/.coordex/state.json`

This keeps ordinary chats but deletes only agent chat entries for the target project.

It also repairs the current selection so Coordex does not point at a deleted agent chat.

```bash
python3 - <<'PY'
import json, pathlib, os
from datetime import datetime, timezone

project_root = os.environ["PROJECT_ROOT"]
state_path = pathlib.Path.home().joinpath(".coordex", "state.json")
state = json.loads(state_path.read_text())
project = next((p for p in state["projects"] if p["rootPath"] == project_root), None)

if not project:
    raise SystemExit(f"Project not found in {state_path}: {project_root}")

project_id = project["id"]
state["chats"] = [
    chat for chat in state["chats"]
    if not (chat["projectId"] == project_id and chat["kind"] == "agent")
]

remaining_chats = [
    chat for chat in state["chats"]
    if chat["projectId"] == project_id and chat["kind"] == "chat"
]
remaining_chats.sort(key=lambda chat: chat.get("lastOpenedAt") or "", reverse=True)

if state.get("selection", {}).get("projectId") == project_id:
    state["selection"]["chatId"] = remaining_chats[0]["id"] if remaining_chats else None

now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
project["updatedAt"] = now
if remaining_chats:
    project["lastOpenedAt"] = remaining_chats[0].get("lastOpenedAt") or now

state_path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n")
PY
```

## Step 5: delete the project `Agents/` directory and project board files

```bash
rm -rf "$PROJECT_ROOT/Agents"
rm -rf "$PROJECT_ROOT/.coordex"
```

Important note:

- `.coordex/` is allowed to come back later as a blank initial board
- that regeneration is normal behavior, not stale data contamination

## Step 6: reset the root `AGENTS.md` roster block

Replace the roster body between `<!-- COORDEX:AGENT-ROSTER:START -->` and `<!-- COORDEX:AGENT-ROSTER:END -->` with the empty-state row below:

```md
| Role | Directory | Thread | Responsibility |
| --- | --- | --- | --- |
| _None yet_ | — | — | No role agents have been created from Coordex yet. |
```

If you want a scripted reset, use:

```bash
python3 - <<'PY'
import os, pathlib, re

project_root = os.environ["PROJECT_ROOT"]
agents_path = pathlib.Path(project_root) / "AGENTS.md"
content = agents_path.read_text()

replacement = """<!-- COORDEX:AGENT-ROSTER:START -->
This block is maintained by Coordex and keeps active role agents aligned across the local role directories under `Agents/`, the Codex threads started from those directories, and this project-level roster.

Agent threads should start in `Agents/<role>/` so Codex loads instructions from the project root down to the role directory: this `AGENTS.md`, then `Agents/AGENTS.md`, then `Agents/<role>/AGENTS.md`.

Root chats created from Coordex remain project-root conversations and are intentionally excluded from this role roster.

| Role | Directory | Thread | Responsibility |
| --- | --- | --- | --- |
| _None yet_ | — | — | No role agents have been created from Coordex yet. |

<!-- COORDEX:AGENT-ROSTER:END -->"""

pattern = re.compile(
    r"<!-- COORDEX:AGENT-ROSTER:START -->.*?<!-- COORDEX:AGENT-ROSTER:END -->",
    re.S,
)

next_content, count = pattern.subn(replacement, content, count=1)
if count != 1:
    raise SystemExit("Could not find exactly one Coordex agent roster block in AGENTS.md")

agents_path.write_text(next_content)
PY
```

## Step 7: restart Coordex

```bash
cd "$PROJECT_ROOT"
npm run dev
```

Restarting matters because the server may still hold old in-memory state from before the cleanup.

## Step 8: verify the clean state

At minimum, verify all of the following:

- the target project still shows ordinary chats
- no agent chats appear in the Coordex UI
- `Agents/` does not exist under the project root
- the root `AGENTS.md` roster shows `_None yet_`
- `.coordex/current-plan.md` and `.coordex/project-board.json`, if regenerated, are blank initial files

Optional API check:

```bash
python3 - <<'PY'
import json, urllib.request, os

project_root = os.environ["PROJECT_ROOT"]
bootstrap = json.load(urllib.request.urlopen("http://localhost:4318/api/bootstrap"))
project = next((p for p in bootstrap["projects"] if p["rootPath"] == project_root), None)

if not project:
    raise SystemExit(f"Project not found from /api/bootstrap: {project_root}")

payload = json.load(
    urllib.request.urlopen(f"http://localhost:4318/api/projects/{project['id']}")
)

print(json.dumps({"project": payload["project"], "chats": payload["chats"]}, ensure_ascii=False, indent=2))
PY
```

The expected result is that only the preserved ordinary chats remain.
