# Dedicated Browser Workflow

Coordex browser debugging must use the dedicated Google Chrome instance, not a generic auto-connected browser.

This is a hard requirement for this project, not a preference.

## Why

- We want a stable browser target with preserved login state, tabs, and the already-open Coordex preview.
- We want to avoid validation drift caused by accidentally attaching to the wrong browser profile or the wrong open tabs.
- We do not want the `chrome-devtools-mcp` `--autoConnect` flow, because that flow asks Chrome for user permission when it requests a remote debugging session.
- In the operator's actual workflow, the normal everyday browser is more likely to trigger repeated Chrome authorization prompts when new debugging sessions attach.
- In the operator's observed workflow, the dedicated Chrome instance has so far avoided those repeated prompts, which materially reduces user cost during frequent browser validation.
- We use the manual `--browser-url` style workflow instead: attach to an already running Chrome instance that was started with a fixed remote debugging port and a non-default user data directory.

## Fixed instance

- `browserUrl`: `http://127.0.0.1:9333`
- `remote-debugging-port`: `9333`
- `user-data-dir`: `/tmp/chrome-mcp-dedicated-9333`

## Validation rule

- Only treat browser validation as complete if the agent can confirm it is attached to this dedicated Chrome instance.
- Do not treat a generic `chrome-devtools` auto-connected browser as valid just because the tool itself is available.
- Do not treat a default Chrome profile path such as `~/Library/Application Support/Google/Chrome/...` as valid evidence. That indicates attachment to the wrong browser instance.
- Prefer reusing already-open tabs inside the dedicated browser session when they already show the needed preview or target page.
- Do not open duplicate tabs for the same validation target unless a new tab is strictly required for the step being performed.
- If that cannot be confirmed, do not claim browser verification is done. Ask the user to validate in the dedicated browser and report back.

## Practical confirmation

The most reliable low-level confirmation is against the dedicated Chrome DevTools endpoint itself:

```bash
curl -s http://127.0.0.1:9333/json/version
curl -s http://127.0.0.1:9333/json/list
```

Valid confirmation means:

- `json/version` responds successfully from `127.0.0.1:9333`
- `json/list` shows the expected already-open pages from the dedicated browser session
- any claimed browser validation work can be tied back to this fixed browser target

If a browser automation tool instead reports that it is looking for `DevToolsActivePort` under the default Chrome profile, that is not the dedicated browser workflow and the attempt is invalid for Coordex.

## MCP configuration

If the local `chrome-devtools` MCP server is enabled, its configuration should target the dedicated browser directly instead of using auto-connect.

Preferred form:

```toml
[mcp_servers.chrome-devtools]
args = ["--browser-url=http://127.0.0.1:9333"]
```

Do not use this workflow for Coordex:

```toml
[mcp_servers.chrome-devtools]
args = ["--autoConnect", "--channel", "stable"]
```

Per the Chrome DevTools MCP documentation, `--autoConnect` attaches to Chrome's default profile selection, while `--browser-url` targets the already running debuggable browser instance explicitly. For this repo, only the explicit dedicated-browser target is valid.

## Reference

- Chrome DevTools MCP README: manual connection via `--browser-url`
- Chrome for Developers: `--autoConnect` asks Chrome for user permission
- Chrome for Developers: remote debugging now requires a non-default `--user-data-dir`
