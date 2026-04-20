# Codex Model And Context Configuration

This document records the confirmed way Coordex-managed projects should configure model choice, reasoning effort, context window size, and automatic compaction thresholds.

It separates three different concerns that are easy to mix together:

- persistent project defaults in `.codex/config.toml`
- runtime request overrides sent through `codex app-server`
- the effective context window that a live thread later reports back through token-usage events

## Official configuration keys

OpenAI's Codex config reference currently documents these project-level keys:

- `model`
- `model_reasoning_effort`
- `model_context_window`
- `model_auto_compact_token_limit`

Reference:

- [Configuration Reference – Codex](https://developers.openai.com/codex/config-reference)

Relevant documented definitions at the time this note was written:

- `model`: selects the model, for example `gpt-5.4`
- `model_reasoning_effort`: adjusts reasoning effort for supported models
- `model_context_window`: declares the context window tokens available to the active model
- `model_auto_compact_token_limit`: sets the token threshold that triggers automatic history compaction; when unset, Codex uses the model default

## Official model guidance relevant to Coordex

For the current default Coordex profile, the relevant official model facts are:

- `gpt-5.4` is documented as a frontier model for complex reasoning and coding work
- the `gpt-5.4` model page lists `reasoning.effort` support for `none`, `low`, `medium`, `high`, and `xhigh`
- the `gpt-5.4` model page lists a `1,050,000` token context window

References:

- [GPT-5.4 model page](https://developers.openai.com/api/docs/models/gpt-5.4)
- [Models overview](https://developers.openai.com/api/docs/models)

## Recommended Coordex project default

For visible multi-agent project work, the current Coordex default remains:

```toml
model = "gpt-5.4"
model_reasoning_effort = "xhigh"
model_context_window = 1000000
model_auto_compact_token_limit = 700000
```

These values belong in the target project's root-level `.codex/config.toml`.

## Why the project file matters

Coordex uses project-local Codex configuration as the durable default for:

- new thread creation under that project
- future turns sent from existing visible role threads
- future resumes that re-enter the same project tree

That makes `.codex/config.toml` the right place for persistent project policy.

## Runtime behavior confirmed in Coordex

Coordex currently reads `model` and `model_reasoning_effort` from the nearest project `.codex/config.toml`, then passes them into `codex app-server` requests.

Confirmed current request behavior in Coordex code:

- `thread/start`: sends `model` when present
- `turn/start`: sends both `model` and `effort` when present

This means Coordex can do both of these at once:

- persist the project default by editing `.codex/config.toml`
- explicitly send the selected runtime profile on future app-server requests

## App-server runtime switching: what is confirmed

Coordex performed a direct local app-server probe on `2026-04-21`.

Observed result:

- `thread/start` accepted a runtime `model` override
- `turn/start` accepted a runtime `model` override
- `turn/start` accepted a runtime `effort` override

Practical conclusion:

- app-server does support runtime profile selection through request fields
- Coordex does not need to rely only on passive config-file discovery for future turns

## App-server config persistence: what is not confirmed

Coordex has not found a documented or visible app-server RPC that explicitly says:

- "update `.codex/config.toml`"
- or "persist current model/reasoning choice to project config"

Because that capability is not currently confirmed, Coordex should treat persistence and runtime override as two separate layers:

1. write the project default into `.codex/config.toml`
2. send `model` and `effort` explicitly on future app-server calls

This is the safest implementation because it does not depend on an undocumented implicit writeback path.

## Effective live window vs configured window

The configured `model_context_window` and the effective window later reported by a live thread are not always numerically identical.

In local Coordex probes:

- config was set to `model_context_window = 1000000`
- live thread token-usage events reported an effective `model_context_window` around `950000`

Treat this as normal runtime behavior rather than a Coordex bug. The configured value is still the correct project policy input; the live reported value is the usable runtime window observed by Codex.

## Coordex implementation rule

When the operator changes the model or reasoning effort from Coordex:

- Coordex should update the target project's `.codex/config.toml`
- Coordex should use that updated profile for later `thread/start` and `turn/start` calls
- Coordex should not assume the current already-running turn changes in place

The safe operator-facing wording is:

- changes apply to future thread starts and future turns
- they are not guaranteed to rewrite the profile of a turn that is already running
