# Context Retention After Compaction

This document records the current Coordex strategy for reducing context loss after Codex auto-compacts long conversations.

It is a practical project policy, not a generic survey.

As of 2026-04-18, the current decision is:

- keep required project knowledge in checked-in files
- use a `SessionStart` hook as the only hook-based reminder layer for now
- treat Codex Memories as a helpful soft recall layer, not as the source of truth
- do not use `UserPromptSubmit` or `Stop` hooks yet because their token and attention cost is too high for the current workflow

## Why this document exists

The problem is specific:

- a role thread runs long enough that Codex auto-compacts earlier turns
- the compressed summary no longer preserves every constraint that mattered
- the role then re-enters a previously rejected development path
- the human must restate constraints that should already have been preserved

Coordex needs a repeatable mitigation that is visible, durable, and cheap enough to keep enabled.

## What is actually confirmed in official docs

Relevant official references:

- [Hooks](https://developers.openai.com/codex/hooks)
- [Memories](https://developers.openai.com/codex/memories)
- [Configuration Reference](https://developers.openai.com/codex/config-reference)
- [Custom instructions with AGENTS.md](https://developers.openai.com/codex/guides/agents-md)
- [Best practices](https://developers.openai.com/codex/learn/best-practices)
- [Compaction](https://developers.openai.com/api/docs/guides/compaction)

The important confirmed facts are:

- `SessionStart` is an official Codex hook event.
- Officially documented `SessionStart` sources are only `startup` and `resume`.
- The official docs do not currently promise a distinct "after compaction" hook event.
- Hooks are loaded from `hooks.json` next to active config layers, most usefully `~/.codex/hooks.json` and `<repo>/.codex/hooks.json`.
- Hooks are still under development and require `features.codex_hooks = true`.
- `SessionStart` can inject extra developer context by printing plain text to `stdout`, or by returning JSON with `hookSpecificOutput.additionalContext`.
- Codex Memories are off by default.
- Memories are generated asynchronously in the background, not immediately at thread end.
- Memories skip active or short-lived sessions and wait for enough idle time before extraction.
- OpenAI explicitly says required team guidance should stay in `AGENTS.md` or checked-in documentation, not only in memories.
- The public docs expose memory enablement and memory policy controls, but they do not expose a documented "write memory now" command that can be relied on as an immediate checkpoint operation.
- API-level compaction preserves prior state in an opaque compacted form, but that compacted state is not a project-controlled durable source of truth.

## The key design conclusion

The most important conclusion is:

- we should not try to solve this primarily with Memories

Memories are useful, but they are not strong enough for this problem because:

- they are delayed
- they are selective
- they are generated state
- they are not guaranteed to update after every meaningful turn
- they are not the right place for rules that must always apply

The second important conclusion is:

- `SessionStart` is officially supported, but a post-compaction re-trigger is not an official guarantee

So Coordex should use `SessionStart` in a conservative way:

- rely on it for startup and resume, because that is documented
- accept any additional runtime re-trigger after compaction as a bonus, not as a hard contract

## Coordex policy

Coordex currently adopts a three-layer model.

### 1. Hard source of truth

Must live in checked-in files.

Examples:

- project identity and durable operating rules in `AGENTS.md`
- shared role-space rules in `Agents/AGENTS.md`
- current project goal and active task list in a current-plan file
- per-role current assignment, blockers, and next step in a role-state or handoff file
- key irreversible decisions in a decision log

If losing a piece of information would cause repeated wrong implementation, it belongs in this layer.

### 2. Hook-based reminder layer

Use only `SessionStart` for now.

Its job is not to invent truth. Its job is to restate the minimum necessary truth from the hard source-of-truth files at the start of a session or resume.

### 3. Soft recall layer

Use Codex Memories only as optional reinforcement for:

- recurring workflow preferences
- stable project conventions
- common pitfalls
- tech-stack reminders

If a memory disappears or is stale, the workflow must still work.

## Why Coordex chooses only `SessionStart` for now

This is a deliberate tradeoff.

`UserPromptSubmit` and `Stop` are both officially available hook events, but they are not enabled in the current Coordex policy because:

- they fire more often
- they add repeated context pressure
- they are more likely to create token waste
- they can make the model pay attention to repeated boilerplate instead of the actual task
- they increase the chance of hook logic becoming noisier than the problem it is solving

For the current stage, Coordex prefers a smaller but clearer mechanism:

- inject the right reminder at session start or resume
- keep the reminder compact
- push real authority into files instead of repeated runtime chatter

This keeps the workflow readable and cheaper while still addressing the main failure mode.

## What `SessionStart` should and should not do

### It should do

- read a very small set of high-value files
- extract only the current durable constraints that matter for the role
- emit a short reminder as extra developer context
- point the role back to the source files when precision matters

### It should not do

- dump large documents into the prompt
- duplicate the full project history
- re-explain every workflow rule already covered by `AGENTS.md`
- summarize unstable chat history as if it were durable truth
- depend on undocumented post-compaction behavior

## Recommended information split

Use this split when deciding what must survive compaction.

### Put in `AGENTS.md`

Only stable rules:

- project identity
- authority order
- role boundaries
- non-negotiable constraints
- standard validation expectations

### Put in current-plan docs

Only current execution state:

- current goal
- current subfunctions
- done conditions
- current owner per subfunction

### Put in role-state or handoff docs

Only role-local working state:

- what this role is responsible for right now
- what has already been attempted
- current blockers
- exact next step

### Leave to Memories only if they are non-critical

Examples:

- "this repo usually uses `rg` first"
- "the team prefers concise final summaries"
- "this project often validates in dedicated Chrome"

These are useful, but the system should still function if they are absent.

## Recommended `SessionStart` payload shape

The injected reminder should stay short enough that it does not become a second prompt transcript.

A good target is:

- one sentence for role identity
- one sentence for current project goal
- one sentence for the current task or active milestone
- one sentence for the top blocking constraint
- one sentence pointing back to the canonical file paths

Example shape:

```text
Role: engineer.
Current project goal: stabilize the current Coordex planning workflow.
Current assigned task: implement only the active subfunction owned by engineer; do not widen scope.
Critical constraint: durable truth is in AGENTS.md and the current-plan and role-state docs, not old chat history.
Before changing direction, re-read: AGENTS.md, .coordex/current-plan.md, docs/project/role-state/engineer.md.
```

If JSON output is preferred, use the official `SessionStart` hook output form:

```json
{
  "hookSpecificOutput": {
    "hookEventName": "SessionStart",
    "additionalContext": "Role: engineer. Current goal: stabilize the planning workflow. Re-read AGENTS.md and the current role-state file before widening scope."
  }
}
```

## Recommended hook configuration

Official docs support a `SessionStart` hook config like this:

```json
{
  "hooks": {
    "SessionStart": [
      {
        "matcher": "startup|resume",
        "hooks": [
          {
            "type": "command",
            "command": "python3 .codex/hooks/session_start_context.py",
            "statusMessage": "Loading Coordex session state"
          }
        ]
      }
    ]
  }
}
```

Recommended placement:

- repo-local: `<repo>/.codex/hooks.json`
- user-global only if the same behavior should apply everywhere: `~/.codex/hooks.json`

Recommended feature flag:

```toml
[features]
codex_hooks = true
```

## Recommended SessionStart script behavior

The hook script should stay simple.

Recommended algorithm:

- read only a very small set of durable project files
- derive a compact reminder from those files
- emit `hookSpecificOutput.additionalContext`
- write a lightweight local marker so hook invocations are observable without asking the model to self-report

## Recommended observable marker

To avoid guessing whether the hook actually ran, Coordex should maintain a tiny local marker under the project:

- `.coordex/runtime/session-start-last.json`
- `.coordex/runtime/session-start-events.jsonl`

Recommended marker fields:

- `hookEventName`
- `detectedAt`
- `source`
- `sessionId`
- `cwd`
- `roleKey`
- `model`
- `transcriptPath`

This marker is for observability only.

It does not change the authority model, and it does not prove that Codex will always rerun `SessionStart` after internal compaction.

What it does provide is:

- a durable record that `SessionStart` fired at least once for a given startup or resume
- a before-and-after checkpoint that can be inspected around a manual compact test
- a way to distinguish "the hook did not fire" from "the hook fired but the model still drifted"

If the compact test produces no new marker event, that is evidence that this runtime did not expose a fresh `SessionStart` invocation at that moment.

1. Read `cwd` and identify the active role from the working directory if possible.
2. Read a small fixed file set in priority order.
3. Ignore missing files without failing the session.
4. Build a short reminder with only current durable facts.
5. Return that reminder as `additionalContext`.

Recommended file priority:

1. root `AGENTS.md`
2. `Agents/AGENTS.md` when inside a role directory
3. role-local state or handoff file for the active role
4. current-plan file
5. compact decision log only if it contains active blocking decisions

The script should not scan the entire repo or synthesize a giant summary every time.

## How this mitigates compaction loss

This strategy does not stop compaction.

Instead, it reduces the damage from compaction by ensuring:

- the most important guidance is already outside chat history
- startup and resume always have a cheap way to reload that guidance
- if the runtime also happens to re-run `SessionStart` after an internal compaction boundary, the agent receives the same reminder again

The hard guarantee comes from the files.

The hook only improves the chance that the model re-attends to those files at the right time.

## What this strategy cannot guarantee

This policy is intentionally honest about its limits.

It cannot guarantee that:

- Codex will always re-fire `SessionStart` after every internal auto-compaction event
- Memories will update immediately after a thread ends
- soft memories will contain every important recent decision
- a long-running role will never drift without human supervision

That is why the checked-in file layer remains mandatory.

## Future escalation path

If `SessionStart` alone proves insufficient in real use, the next escalation should be narrow, not broad.

The order should be:

1. improve the hard source-of-truth files
2. reduce the `SessionStart` reminder to higher-signal facts
3. only then consider a very narrow `UserPromptSubmit` rule for specific high-risk role threads

Coordex should not add `UserPromptSubmit` or `Stop` hooks by default unless real usage shows that `SessionStart` plus durable files is still not enough.

## Current Coordex decision summary

The current project decision is:

- use `SessionStart` because it is officially supported
- treat startup and resume as the guaranteed trigger points
- treat any post-compaction `SessionStart` behavior as opportunistic, not contractual
- keep required knowledge in repo files
- allow Memories as optional reinforcement only
- do not add `UserPromptSubmit` or `Stop` hooks at this stage

This gives Coordex the lowest-complexity path that still meaningfully reduces repeated wrong-path development after context compaction.
