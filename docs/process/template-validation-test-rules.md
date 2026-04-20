# Template Validation Test Rules

This document defines how Coordex itself must test a target project when the goal is to validate whether a Coordex template can correctly govern role behavior.

The purpose of this test is not to rescue a live run with ad hoc prompts.

The purpose is to prove that:

- the generated project files already contain the durable workflow rules
- the generated role files already contain the role charters and boundaries
- the generated SessionStart reminder layer is sufficient to reduce drift after resume or compaction
- a human operator can use Coordex as intended without re-teaching the project its own rules

If a run only succeeds after extra coaching that was not already present in the generated files, that run does not count as a pass.

## Core principle

During template validation, Coordex must simulate a real human operator.

That simulated operator may provide project feature requirements.

That simulated operator may not teach the target project its own operating rules by chat.

Those rules must come from the initialized project package itself:

- root `AGENTS.md`
- `Agents/AGENTS.md`
- `Agents/<role>/AGENTS.md`
- generated project docs
- generated role-state docs
- generated `.codex` SessionStart reminder layer

If the target project cannot follow its required workflow from those files alone, the correct response is:

1. classify the failure
2. fix the reusable Coordex template or Coordex product code at the correct layer
3. clean the target project
4. bootstrap again
5. rerun the test from a clean state

Do not patch over the failure by giving the live project new hidden rules in chat.

## Allowed operator actions

When Coordex is validating a target project, the simulated human operator may:

- register the target root as a Coordex project
- choose a template
- create agents through the Coordex UI
- wait for initialization to complete
- tell the supervisor only the project feature or product requirement to build
- review whether the supervisor produced a valid current plan and valid subfunctions
- inspect whether each subfunction has one owner and a valid status
- click the Coordex execute button for an unfinished subfunction
- read the active chats and observe coordination progress
- compact the currently selected chat from the Coordex UI
- continue observing whether the role still follows the required rules after compaction
- archive threads and reset the project between validation runs

These actions model a real operator using Coordex as a coordination console.

## Forbidden operator actions

During template validation, the simulated operator must not:

- explain project workflow rules to the supervisor in chat
- explain role responsibilities that should already exist in template-generated docs
- explain board schema rules that should already exist in template-generated docs
- explain the structured inter-agent communication contract if that contract is supposed to come from the template
- remind a role which browser debugging port to use if that rule is supposed to come from the template
- remind a role how to research, hand off, accept, archive, or report if those are template-owned rules
- ask the supervisor to repair formatting that should already be mandated by the generated docs
- directly message a worker to start a subfunction that should be started by clicking Coordex's execute button
- bypass the Coordex UI to simulate product behavior that the product itself is supposed to provide
- manually edit the target project's generated runtime docs in the middle of a validation run just to save the run
- reveal hidden test criteria to the supervisor or workers

If any of those become necessary, the test has exposed a real defect.

Treat it as a failure signal, not as a permission to improvise.

## Required test sequence

Use this sequence when validating a template-driven project.

### 1. Start from a known state

Choose the reset mode first.

- If only runtime state is dirty and you intentionally want to preserve the exact same generated bootstrap package, use the agent-only cleanup flow.
- If reusable template files changed, use the full template rebootstrap flow.
- If you are validating a template from a true clean baseline, use the full template rebootstrap flow by default.

For template validation, treat all Coordex-generated bootstrap artifacts as disposable test output, including:

- Coordex-created chats, conversations, sessions, threads, and active turns for that target project
- generated `docs/` trees
- generated hidden directories such as `.codex/` and `.coordex/`
- generated hidden files inside those trees
- generated `Agents/` role directories
- generated role-state docs

Do not keep old Coordex-generated bootstrap files in place during a clean-baseline validation run.

Use [Reset to Clean Agent State](/Users/mawei/MyWork/coordex/docs/process/reset-to-clean-agent-state.md) before the next run when needed.

Before registration or role creation, verify that the target root is already a real project root for Codex.

Current safe Coordex rule:

- if the target root has no `.git`, run `git init` first
- do not rely on user-specific global root-marker overrides
- if earlier role threads were created before `git init`, treat them as contaminated and recreate them after cleanup

### 2. Initialize through Coordex only

Create the project and role agents through Coordex.

Do not add extra runtime rules through chat during initialization validation.

Initialization is only complete when each created role has returned its first assistant reply.

### 3. Give only the feature requirement

Send the supervisor only the product or feature request that a human would normally provide.

Examples of allowed input:

- build a minimal playable prototype for X
- add feature Y
- redesign mechanic Z

Examples of disallowed input:

- here is how you must write the plan format
- here is the coordination protocol you must follow
- here is the required board schema
- here is the debugging browser rule you must obey

If the project needs those reminders, the template is incomplete.

### 4. Validate the generated plan before execution

Before clicking execute on anything, inspect the result as a human operator would.

At minimum, verify:

- a current goal exists
- subfunctions are present
- each subfunction is independently understandable
- each subfunction is assigned to exactly one owner role
- status display is coherent
- the resulting board state is visible and actionable in Coordex

If plan structure is wrong, stop the run and classify the defect.

Do not rescue the run by coaching the supervisor about formatting.

### 5. Start work only through the execute button

Once the plan looks valid, start from the topmost unfinished subfunction.

The simulated operator should:

- click the execute control for that subfunction
- allow the selected role thread to receive the work item
- wait until the subfunction reaches a terminal state or clearly fails
- then move to the next unfinished subfunction

If role-to-role coordination is needed inside an active subfunction, that coordination may proceed automatically.

The human simulation still must not inject hidden process rules into those chats.

### 6. Compact during the run

After the active role has accumulated enough turns to make compaction meaningful, compact the currently selected chat from Coordex.

After compaction, continue the same workflow and verify that the role still:

- follows its charter
- follows the required communication contract
- follows the required reporting and acceptance path
- avoids regressing into rule drift that the template was supposed to prevent

If the standard Coordex `SessionStart` marker is present, inspect `.coordex/runtime/session-start-last.json` or `.coordex/runtime/session-start-events.jsonl` before and after compacting.

Use that marker only as observability:

- a new marker entry means the hook definitely ran again
- no new marker entry means this runtime did not expose a visible fresh `SessionStart` invocation at that moment
- neither outcome changes the pass criterion by itself; the real pass criterion is still whether the role behaves correctly after compaction

Do not repair post-compaction drift by re-teaching the rule in chat.

Post-compaction drift is exactly what this test is meant to expose.

### 7. Judge the failure at the correct layer

When a run fails, classify it before changing anything.

- If the problem is UI behavior, thread lifecycle, sync, parsing, persistence, or board rendering, fix Coordex product code.
- If the problem is role understanding, plan format, communication behavior, acceptance behavior, browser-debug discipline, or compaction drift, fix the reusable template or SessionStart content.
- If the problem exists only in one live run, repair that runtime state only after deciding whether the reusable template source also needs the same improvement.

Use [Coordex Code vs Template Boundary](/Users/mawei/MyWork/coordex/docs/architecture/coordex-code-vs-template-boundary.md) when deciding.

## Pass criteria

A template-validation run passes only if all of the following are true:

- the target project was initialized from Coordex-managed files
- the supervisor was given only feature requirements, not hidden workflow rules
- the plan and subfunctions were usable without manual rule coaching
- work started through the Coordex execute control rather than off-path manual dispatch
- role coordination stayed within the expected contract
- after compaction, the active role still followed the required rules without re-teaching

If the run required extra operator coaching about project rules, count that as a template failure.

## Practical note for future runs

The operator may still discuss normal product scope, priorities, clarifications, and feature tradeoffs with the supervisor.

What is forbidden here is not ordinary project conversation.

What is forbidden is using chat to inject durable process truth that should have been provided by the initialized project package itself.
