# Codex AGENTS Root Discovery Validation

This document records a reproducible local test for one specific Codex behavior:

- when a repository has a Git root
- and both the repo root and a child directory contain `AGENTS.md`
- then a Codex session started from the child directory should load both instruction layers
- while a Codex session started from the repo root should load only the root layer at startup

This validation is important for Coordex because role threads are intended to start inside `projectRoot/Agents/<role>/`, and those threads must inherit the project root instructions plus the role-local instructions.

## What this test proves

The authoritative signal is not the model's final answer by itself.

The authoritative signal is the `turn_context.user_instructions` field written into the Codex session JSONL file at session start. That field shows the actual instruction chain that Codex injected before the model began working.

This distinction matters because a model can later use tools to read deeper files on its own, which can make the final answer look like a deeper `AGENTS.md` was auto-loaded even when it was not.

## Repro path

Use this exact test layout:

- repo root: `/Users/mawei/MyWork/CodexTest3`
- child directory: `/Users/mawei/MyWork/CodexTest3/inner`

## Setup

Create the directories and initialize a Git repository:

```bash
mkdir -p /Users/mawei/MyWork/CodexTest3/inner
cd /Users/mawei/MyWork/CodexTest3
git init
```

Create the root instructions file:

```bash
cat > /Users/mawei/MyWork/CodexTest3/AGENTS.md <<'EOF'
# CodexTest3 Root Probe

This file lives at the Git/project root for the CodexTest3 experiment.

Probe rule:

- If the user prompt contains `PROBE_CHAIN`, include the exact line `ROOT_CHAIN_TOKEN_4F72`.
- If deeper directories also contribute probe lines, include them too.
- For probe prompts, return probe tokens only, one per line, with no explanation.
EOF
```

Create the child-directory instructions file:

```bash
cat > /Users/mawei/MyWork/CodexTest3/inner/AGENTS.md <<'EOF'
# CodexTest3 Inner Probe

This file lives in the `inner/` working directory for the CodexTest3 experiment.

Probe rule:

- If the user prompt contains `PROBE_CHAIN`, include the exact line `INNER_CHAIN_TOKEN_9C31`.
- For probe prompts, return probe tokens only, one per line, with no explanation.
EOF
```

## Execution

Run one Codex session at the repo root and one at the child directory.

This section is written for a normal human manual workflow: change directories first, then run `codex`.

Write the final answers into files so the results are easy to compare:

```bash
cd /Users/mawei/MyWork/CodexTest3
codex exec -o /tmp/codextest3-root.txt \
  --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  "PROBE_CHAIN_2"

cd /Users/mawei/MyWork/CodexTest3/inner
codex exec -o /tmp/codextest3-inner.txt \
  --skip-git-repo-check \
  --dangerously-bypass-approvals-and-sandbox \
  "PROBE_CHAIN_2"
```

## Fastest TUI smoke test

If you want the shortest manual verification path inside the TUI, use this method.

### Step 1: start Codex at the repo root

```bash
cd /Users/mawei/MyWork/CodexTest3
codex
```

Inside the TUI, run:

```text
/status
```

Expected status-level signal:

- `Directory` should be `~/MyWork/CodexTest3`
- `Agents.md` should list only `AGENTS.md`

Then send this exact prompt:

```text
Do not use any tools. Do not read any files. Based only on the instructions already injected into this session at startup, print every probe token already loaded for this session, one per line, and nothing else. Valid tokens are ROOT_CHAIN_TOKEN_4F72 and INNER_CHAIN_TOKEN_9C31.
```

Expected root-session answer:

```text
ROOT_CHAIN_TOKEN_4F72
```

### Step 2: start Codex at the child directory

```bash
cd /Users/mawei/MyWork/CodexTest3/inner
codex
```

Inside the TUI, run:

```text
/status
```

Expected status-level signal:

- `Directory` should be `~/MyWork/CodexTest3/inner`
- `Agents.md` should list two instruction files, one from the parent and one from the current directory
- in the recorded validation and in the observed TUI screenshots, this appears as `../AGENTS.md, AGENTS.md`

Then send the same exact prompt:

```text
Do not use any tools. Do not read any files. Based only on the instructions already injected into this session at startup, print every probe token already loaded for this session, one per line, and nothing else. Valid tokens are ROOT_CHAIN_TOKEN_4F72 and INNER_CHAIN_TOKEN_9C31.
```

Expected child-session answer:

```text
ROOT_CHAIN_TOKEN_4F72
INNER_CHAIN_TOKEN_9C31
```

### What this TUI test proves

This smoke test is the fastest practical manual check for two things at once:

- Git root detection:
  - root session shows only one loaded instructions file: `AGENTS.md`
  - child session shows both the parent and current loaded instruction files
- startup instruction inheritance:
  - root session sees only the root probe
  - child session sees both the root probe and the child probe

Note:

- on the tested `codex-cli 0.121.0` TUI, `/status` did not render a separate `project-root` field
- the practical visible evidence is the combination of `Directory` and `Agents.md`

### Limitation of the TUI-only smoke test

This TUI method is intentionally lightweight, but it is still a smoke test.

If the model ignores the "do not use tools" instruction and reads deeper files anyway, the answer can be contaminated by later tool use. When you need hard proof, inspect the session JSONL startup context as described below.

## Expected output files

The final answer files are useful, but they are not the primary proof.

Expected final answer tendency:

- `/tmp/codextest3-inner.txt` should contain both tokens:

```text
ROOT_CHAIN_TOKEN_4F72
INNER_CHAIN_TOKEN_9C31
```

- `/tmp/codextest3-root.txt` may contain only the root token, but do not rely on this alone.

Why not rely on the root final answer:

- the model can use shell tools during the session
- it may discover and read `inner/AGENTS.md` on its own
- if it does, the final answer can mention the inner token even though the inner file was not part of startup instruction injection

## Primary proof: inspect session startup context

After both commands finish, list the newest session files:

```bash
find ~/.codex/sessions -type f -mmin -5 | sort | tail -n 10
```

Open the newest two rollout files and inspect lines 4 to 6:

```bash
sed -n '4,6p' /path/to/root-session.jsonl
sed -n '4,6p' /path/to/inner-session.jsonl
```

If you want a smaller, more focused view, inspect only the `turn_context` line:

```bash
sed -n '5p' /path/to/root-session.jsonl
sed -n '5p' /path/to/inner-session.jsonl
```

What you should see:

### Root session expected startup context

- `cwd` should be `/Users/mawei/MyWork/CodexTest3`
- `turn_context.user_instructions` should contain only the root probe block
- it should not contain `# CodexTest3 Inner Probe`

### Inner session expected startup context

- `cwd` should be `/Users/mawei/MyWork/CodexTest3/inner`
- `turn_context.user_instructions` should contain both blocks:
  - `# CodexTest3 Root Probe`
  - `# CodexTest3 Inner Probe`

## Minimal human verification checklist

After you run the two commands above, the result counts as successful only if all of the following are true:

- `/tmp/codextest3-inner.txt` contains both probe tokens
- the root session `turn_context` line contains `# CodexTest3 Root Probe`
- the root session `turn_context` line does not contain `# CodexTest3 Inner Probe`
- the inner session `turn_context` line contains both `# CodexTest3 Root Probe` and `# CodexTest3 Inner Probe`

## Concrete reference from the recorded validation

In the recorded run on 2026-04-18:

- root session:
  - `/Users/mawei/.codex/sessions/2026/04/18/rollout-2026-04-18T08-49-19-019d9e10-43d5-7db1-b3b2-b72a87834afe.jsonl`
  - startup context showed only the root block

- inner session:
  - `/Users/mawei/.codex/sessions/2026/04/18/rollout-2026-04-18T08-49-19-019d9e10-43d5-7052-b03b-0aa9037c9408.jsonl`
  - startup context showed both the root and inner blocks

## Interpretation

This is the behavior Coordex should rely on:

- a role thread started from `projectRoot/Agents/<role>/` can inherit the project root instructions and the role-local instructions at the same time
- a root chat started from `projectRoot/` only gets the root-level instructions at startup

That is exactly the distinction Coordex needs for:

- project-wide identity at the root
- shared role-space rules in intermediate directories
- role-specific instructions in the role directory

## Additional validated case: no Git root vs post-`git init`

The earlier test above proves the positive inheritance case once a Git root exists.

A later local validation on `2026-04-20` established the failure mode and recovery rule that Coordex should now treat as operational guidance.

Test project:

- root: `/Users/mawei/MyWork/CoordexCase2`
- role directory: `/Users/mawei/MyWork/CoordexCase2/Agents/supervisor`
- clean child directory for root-only inheritance check: `/Users/mawei/MyWork/CoordexCase2/new`

Observed sequence:

1. Before `git init`, sessions started from `Agents/supervisor/` could load the role-local layer but did not reliably inherit the root `AGENTS.md` and root SessionStart layer.
2. After `git init` at `/Users/mawei/MyWork/CoordexCase2`, a fresh session started from `new/` inherited the root token and root SessionStart layer.
3. After the same `git init`, a fresh session started from `Agents/supervisor/` inherited all three validated layers:
   - root `AGENTS.md`
   - role-local `AGENTS.md`
   - supervisor-local SessionStart hook
4. A session that had originally been created before `git init` showed mixed behavior after resume:
   - root and local SessionStart hooks could appear
   - but the root `AGENTS.md` token was still absent from the loaded startup chain

Practical conclusion:

- for current Coordex practice, treat a Git root as the only safe baseline for role-thread inheritance
- if the target root has no `.git`, run `git init` before project registration or role creation
- if a role thread was first created before `git init`, treat that thread as contaminated and archive/recreate it instead of trusting it to recover a clean startup chain

## Related docs

- [README.md](/Users/mawei/MyWork/coordex/README.md)
- [AGENTS.md](/Users/mawei/MyWork/coordex/AGENTS.md)
- [Dedicated Browser Workflow](/Users/mawei/MyWork/coordex/docs/process/dedicated-browser-workflow.md)
