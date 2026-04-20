# Reset to Clean Agent State

Use this process when you want to keep ordinary project chats, but remove all Coordex-generated agent artifacts, bootstrap files, hidden state, and board state before running a fresh internal workflow test.

This document records the correct cleanup order for the current Coordex architecture.

## Choose the reset mode first

There are two valid cleanup modes.

Important testing rule:

- if you are validating whether a Coordex template can correctly govern a project from a clean initial state, default to the full template rebootstrap reset
- do not keep old bootstrap docs, hidden Coordex files, or prior generated role files during that kind of validation

### Mode A: agent-only clean reset

Use this when:

- you want to keep the project's existing bootstrap docs and rule files
- you only need to remove agent threads, local agent metadata, and board state
- you are testing the same template/rule set again

This is only appropriate when you intentionally want to preserve the exact same generated bootstrap package.

### Mode B: full template rebootstrap reset

Use this when:

- you changed Coordex template rules and want the target project to pick them up
- you suspect stale generated docs are carrying old behavior forward
- you want the project to regrow its Coordex-managed files from the latest template
- you are validating a template from a clean baseline and want to prove the project can boot and behave correctly from Coordex-generated files alone

Important architecture fact:

- Coordex bootstrap files are only copied when missing.
- Updating a template inside the Coordex repo does not rewrite existing generated docs in an already-registered project.
- So if you want a project to re-read newer template rules, you must delete the old generated copies first and then let Coordex seed them again.
- If role threads or child-directory sessions were first created before the target root had a real project-root marker such as `.git`, treat those sessions as contaminated startup state. Do not trust them to recover a clean root-to-leaf inheritance chain after the fact.

For template validation, Mode B should be treated as the normal reset path.

## What counts as Coordex-generated content

For cleanup purposes, treat the following as Coordex-generated if they were created by project registration, project update, or role creation:

- `Agents/`
- `.codex/`
- `.coordex/`
- Coordex-created Codex conversations, sessions, threads, or running turns for that project
- bootstrap-generated `docs/architecture/`
- bootstrap-generated `docs/process/`
- bootstrap-generated `docs/project/`
- bootstrap-generated `docs/templates/`
- hidden files inside those generated trees, including `.DS_Store`
- generated custom role-state files under `docs/project/role-state/`
- the Coordex-managed workflow block and role roster block inside the project root `AGENTS.md`
- sessions and threads first created before the project root had `.git`, if those threads are being reset specifically to restore clean root inheritance

Important distinction:

- if the project root `AGENTS.md` already existed before Coordex touched the project, preserve the human-owned file itself, but reset or remove only the Coordex-managed injected sections inside it
- if the root `AGENTS.md` was itself created by Coordex for that project, you may delete and regenerate it as part of the full reset

## What must be cleaned

For a project that previously created agents from Coordex, the clean reset is not just one delete.

The following layers must be brought back into sync:

- the real Codex conversations, sessions, threads, and active turns that were created by Coordex for this project
- the Coordex local chat metadata in `~/.coordex/state.json`
- the project `Agents/` directory
- the project root `AGENTS.md` roster block
- the project-local board files under `.coordex/`
- any Coordex-generated bootstrap docs and hidden files under `docs/` and `.codex/`

If you skip the real Codex thread archive step, the old agent threads can be re-imported on the next sync.

For strict cleanup, do not limit this to agent threads only.

If Coordex created project-root chats or other Coordex-origin threads for the target project, archive those too unless you explicitly intend to preserve them.

If a Coordex-created thread still has an active in-progress turn, interrupt that turn first and then archive the thread so the cleanup removes both the persisted conversation and the live execution state.

## Intended result

After a successful reset:

- ordinary root chats remain available
- agent chats are gone from Coordex
- `Agents/` no longer exists under the project root
- the root `AGENTS.md` roster shows `_None yet_`
- `.coordex/` may be recreated later by the server, but only as a blank initial board

For Mode B, also expect:

- all prior Coordex-generated bootstrap content to be gone before rebuild, including hidden files in those generated trees
- `docs/`, `.codex/`, `.coordex/`, and `Agents/` bootstrap content to be regenerated from the latest template
- the root `AGENTS.md` workflow block to resync to the latest template wording
- any previously contaminated pre-`git init` role threads to be gone and replaced only by fresh post-`git init` threads

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
test -d "$PROJECT_ROOT/.codex" && cp -R "$PROJECT_ROOT/.codex" /tmp/coordex-cleanup-backup/project-codex.bak
test -d "$PROJECT_ROOT/docs" && cp -R "$PROJECT_ROOT/docs" /tmp/coordex-cleanup-backup/project-docs.bak
```

## Step 2: inspect the current project entry and Coordex-created threads

This prints the registered project and every Coordex-created chat for that project.

```bash
python3 - <<'PY'
import json, pathlib, os

project_root = os.environ["PROJECT_ROOT"]
state = json.loads(pathlib.Path.home().joinpath(".coordex", "state.json").read_text())
project = next((p for p in state["projects"] if p["rootPath"] == project_root), None)

if not project:
    raise SystemExit(f"Project not found in ~/.coordex/state.json: {project_root}")

coordex_chats = [
    {
        "chatId": chat["id"],
        "threadId": chat["threadId"],
        "title": chat["title"],
        "kind": chat["kind"],
        "source": chat["source"],
        "cwd": chat["cwd"],
    }
    for chat in state["chats"]
    if chat["projectId"] == project["id"] and chat["source"] == "coordex"
]

print(json.dumps({"project": project, "coordexChats": coordex_chats}, ensure_ascii=False, indent=2))
PY
```

## Step 3: archive the real Codex threads created by Coordex

This step is mandatory.

Deleting only the local Coordex metadata is not enough, because `codex app-server` can re-list those threads later.

If any agent thread is still running or stuck in `waitingOnApproval`, interrupt the active turn first and then archive the thread. Archiving without interrupting can leave the cleanup order harder to reason about.

The following script:

- reads the Coordex-created `threadId` list for the target project from `~/.coordex/state.json`
- calls `codex app-server`
- sends `turn/interrupt` for any in-progress turn it finds
- sends `thread/archive` for each Coordex-created thread

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
  .filter((chat) => chat.projectId === project.id && chat.source === "coordex")
  .map((chat) => chat.threadId);

if (!threadIds.length) {
  console.log("No Coordex-created threads to archive.");
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

## Step 4: remove local Coordex-created chat metadata from `~/.coordex/state.json`

This keeps imported or human-preserved chats but deletes all Coordex-created chat entries for the target project.

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
    if not (chat["projectId"] == project_id and chat.get("source") == "coordex")
]

remaining_chats = [
    chat for chat in state["chats"]
    if chat["projectId"] == project_id
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

### Step 5B: delete all Coordex-generated bootstrap files so new template rules can regrow

Run this for Mode B.

Run this by default for template-validation work.

This is the step that makes template rule changes actually take effect in an existing project.

This is also the step that restores a true Coordex-clean baseline by removing files and hidden contents that Coordex itself previously created.

It removes the Coordex bootstrap copies for:

- `Agents/`
- `.codex/`
- `.coordex/`
- `docs/architecture/`
- `docs/process/`
- `docs/project/`
- `docs/templates/`
- hidden files under those generated directories

Do not run this blindly if those directories contain hand-written project docs you still need.
Back them up first, or selectively delete only the files that came from the template.

```bash
rm -rf "$PROJECT_ROOT/Agents"
rm -rf "$PROJECT_ROOT/.codex"
rm -rf "$PROJECT_ROOT/.coordex"
rm -rf "$PROJECT_ROOT/docs/architecture"
rm -rf "$PROJECT_ROOT/docs/process"
rm -rf "$PROJECT_ROOT/docs/project"
rm -rf "$PROJECT_ROOT/docs/templates"
```

Also remove transient hidden artifacts inside any remaining generated tree:

```bash
find "$PROJECT_ROOT/Agents" "$PROJECT_ROOT/.codex" "$PROJECT_ROOT/.coordex" "$PROJECT_ROOT/docs" \
  -name '.DS_Store' -delete 2>/dev/null || true
```

## Step 6: reset the Coordex-managed sections of root `AGENTS.md`

If the root `AGENTS.md` was human-authored before Coordex registration, do not delete the file.

Instead, reset the Coordex-managed injected sections inside it.

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

### Optional Step 7B: force the project bootstrap package to run again

Run this for Mode B after restarting the Coordex server.

You need one of these actions:

- re-register the project in the Coordex UI
- edit and save the same project in the Coordex UI
- or call the project update API with the same `name` and `rootPath`

Reason:

- the project bootstrap package only writes missing files
- after you deleted the generated bootstrap files, you must trigger bootstrap again so the latest template seeds them back into the project root

Example API path:

```bash
python3 - <<'PY'
import json, urllib.request, os

project_root = os.environ["PROJECT_ROOT"]
bootstrap = json.load(urllib.request.urlopen("http://localhost:4318/api/bootstrap"))
project = next((p for p in bootstrap["projects"] if p["rootPath"] == project_root), None)
if not project:
    raise SystemExit(f"Project not found from /api/bootstrap: {project_root}")

payload = json.dumps({
    "name": project["name"],
    "rootPath": project["rootPath"],
}).encode("utf-8")

req = urllib.request.Request(
    f"http://localhost:4318/api/projects/{project['id']}",
    data=payload,
    headers={"Content-Type": "application/json"},
    method="PATCH",
)
print(urllib.request.urlopen(req).read().decode("utf-8"))
PY
```

## Step 8: verify the clean state

At minimum, verify all of the following:

- the target project still shows ordinary chats
- no agent chats appear in the Coordex UI
- `Agents/` does not exist under the project root
- the root `AGENTS.md` roster shows `_None yet_`
- `.coordex/current-plan.md` and `.coordex/project-board.json`, if regenerated, are blank initial files
- no stale Coordex-generated bootstrap directories remain from the previous run if you chose Mode B
- no hidden junk files remain under deleted Coordex-generated trees

For Mode B, also verify:

- `docs/process/`, `docs/project/`, and `docs/templates/` were re-seeded from the latest template
- `Agents/supervisor/AGENTS.md` contains the latest supervisor rule changes you expected
- the root `AGENTS.md` workflow block reflects the latest template wording

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

## Step 9: verify the first rebuilt plan before executing any subfunction

After rebuilding agents from a clean state, do not immediately click execute.

Check all of the following first:

- the current plan goal is present
- each subfunction shows the correct role owner in `.coordex/current-plan.md`
- `.coordex/project-board.json` uses the current Coordex schema
- the UI shows the expected owner badge such as `E` or `A`, not `?`
- the execute button is enabled and reads `Execute with <role>`

If the plan markdown looks right but the board still shows `?` or `Assign a role first`, stop.

That means the human-readable plan and the machine board are out of sync, and the project is not in a valid execution state yet.
