# Structured Agent Communication Protocol

This document defines the durable communication contract for role-to-role and role-to-supervisor coordination in Coordex.

It is intentionally stricter than normal human chat.

## Why Coordex should use a structured protocol

The current best-practice direction from OpenAI's agent guidance is consistent on a few points:

- use structured outputs instead of freeform text whenever downstream systems or other agents depend on exact fields
- constrain data flow with fixed schemas, enums, and required keys
- keep multi-agent components well scoped and composable
- define typed edges or explicit data contracts between steps
- keep `AGENTS.md` short and use it as a map, not as a giant operating manual

Relevant references:

- [Structured Outputs guide](https://developers.openai.com/api/docs/guides/structured-outputs)
- [Introducing Structured Outputs](https://openai.com/index/introducing-structured-outputs-in-the-api/)
- [Safety in building agents](https://developers.openai.com/api/docs/guides/agent-builder-safety)
- [Agent Builder](https://developers.openai.com/api/docs/guides/agent-builder)
- [Node reference](https://developers.openai.com/api/docs/guides/node-reference)
- [A practical guide to building agents](https://cdn.openai.com/business-guides-and-resources/a-practical-guide-to-building-agents.pdf)
- [Harness engineering: leveraging Codex in an agent-first world](https://openai.com/index/harness-engineering/)

For Coordex, the practical implication is simple:

- human-facing prompts may stay natural-language
- agent-to-agent and agent-to-supervisor coordination should use a constrained machine-readable envelope

## What is actually enforceable today

Coordex currently operates over visible Codex threads in the Codex app and app-server.

That means:

- Coordex does not yet control a native `response_format: { type: "json_schema" }` contract for thread replies
- Coordex therefore cannot hard-enforce API-level Structured Outputs inside visible Codex chats today

So the current best practical design is:

1. define one durable JSON protocol in the repository
2. make every role read that protocol during initialization
3. require structured JSON replies in dispatch and coordination prompts
4. reject or resend malformed replies at the workflow layer when Coordex later automates those exchanges more deeply

When Coordex moves more agent-to-agent messaging under programmatic control, it should upgrade this same contract into real Structured Outputs with strict schema validation and no parallel schema-breaking tool calls.

## Scope rule

The current workflow rule is:

- the human operator or supervisor starts the active subfunction owner
- once a subfunction is active, peer roles may coordinate directly only within that subfunction's scope
- scope expansion, reprioritization, or final acceptance still go back to the supervisor or human

This protocol exists to keep those direct role interactions auditable and drift-resistant.

## Protocol choice

Coordex should standardize on:

- one top-level JSON object
- fixed English field names
- fixed enum values for `kind` and `status`
- no prose outside the JSON object
- one message = one coordination event

Values inside string fields may be Chinese or English. Field names should remain English and stable.

## Protocol name

Use:

- `protocol_version: "coordex-agent-io.v1"`

If the contract changes incompatibly, bump the version string instead of silently drifting field semantics.

## Required message shape

Every agent coordination message should follow this top-level structure:

```json
{
  "protocol_version": "coordex-agent-io.v1",
  "task_id": "demo-feature-v4-input",
  "from_role": "engineer",
  "to_role": "supervisor",
  "kind": "result",
  "status": "answered",
  "summary": "Implemented the structured coordination protocol and updated startup docs.",
  "input": "Define a durable, low-drift communication contract for role threads.",
  "expected_output": "A documented protocol plus template and initialization coverage.",
  "output": "Added the protocol doc, linked it from project docs, and updated role startup guidance.",
  "artifacts": [
    {
      "path": "docs/process/structured-agent-communication-protocol.md",
      "kind": "doc"
    }
  ],
  "validation": [
    "npm run build"
  ],
  "blockers": [],
  "next_role_request": null
}
```

## Field rules

Required fields:

- `protocol_version`: fixed string
- `task_id`: stable task or subfunction id from Coordex
- `from_role`: sender role id
- `to_role`: intended receiving role id
- `kind`: one enum value from the allowed list below
- `status`: one enum value from the allowed list below
- `summary`: one short outcome sentence
- `input`: the scoped request or question being answered
- `expected_output`: what success or the requested answer should look like
- `output`: what was actually produced so far

Optional fields:

- `artifacts`: array of changed or produced artifacts
- `validation`: array of validation steps or checks
- `blockers`: array of unresolved blockers
- `next_role_request`: either `null` or a structured bounded follow-up request

Recommended shapes for optional fields:

```json
{
  "artifacts": [
    { "path": "src/client/App.tsx", "kind": "code" },
    { "path": "docs/process/structured-agent-communication-protocol.md", "kind": "doc" }
  ],
  "validation": ["npm run build", "manual review in dedicated Chrome"],
  "blockers": ["Need supervisor confirmation on final field list."],
  "next_role_request": {
    "to_role": "supervisor",
    "kind": "decision",
    "reason": "Need approval to freeze protocol v1."
  }
}
```

## Allowed enums

`kind` must be one of:

- `dispatch`
- `question`
- `blocker`
- `handoff`
- `result`
- `decision`

`status` must be one of:

- `open`
- `answered`
- `blocked`
- `done`

## Semantic guidance

Recommended pairings:

- `dispatch` + `open`
- `question` + `open` or `answered`
- `blocker` + `blocked`
- `handoff` + `open` or `done`
- `result` + `answered` or `done`
- `decision` + `answered` or `done`

These are conventions, not hard parser rules, but drifting away from them should be rare.

## Output discipline

When an agent is explicitly asked to reply in protocol form, it should:

- output exactly one JSON object
- not wrap the JSON in markdown fences
- not add an introduction or trailing explanation
- not omit required keys
- not invent new top-level keys
- keep `summary` short
- keep `task_id`, `from_role`, and `to_role` stable across the same subfunction thread

## Human prompts vs agent prompts

Humans may still send natural-language dispatches.

But those dispatches should tell the receiving role to reply in `coordex-agent-io.v1`.

In other words:

- human input can be friendly
- agent output should be structured

## Board normalization rule

The current Coordex board stores a normalized subset of this protocol:

- `kind`
- `status`
- `summary`
- `input`
- `expected_output`
- `output`

The richer optional fields are still worth keeping in the thread message itself even before every field is surfaced in the board UI.

## Placement rule

This protocol should live primarily in this durable doc.

Use the layers like this:

- root `AGENTS.md`: mention that structured coordination exists and point here
- `Agents/AGENTS.md`: summarize the rule that peer coordination inside an active subfunction must use this protocol
- `Agents/<role>/AGENTS.md`: add role-specific implications only if needed
- initialization prompt: tell each new role to read this doc if it exists and treat it as required for later coordination

Do not copy the whole protocol into every `AGENTS.md` file. That would recreate the giant-instruction-file problem.

## Future enforcement target

When Coordex later mediates more of the agent-to-agent loop directly, the target implementation should be:

1. use strict Structured Outputs or equivalent schema validation for generated agent messages
2. disable parallel schema-breaking output paths when exact schema adherence matters
3. reject malformed messages automatically
4. ask the sending role to resend in the same protocol version

Until then, this document plus initialization-time doc reading is the durable source of truth.
