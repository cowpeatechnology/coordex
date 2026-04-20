# Dedicated Browser Workflow

This project treats dedicated-browser validation as a hard constraint, not a preference.

## Fixed Target

- `browserUrl`: `http://127.0.0.1:9333`
- `remote-debugging-port`: `9333`
- `user-data-dir`: `/tmp/chrome-mcp-dedicated-9333`

## Required Behavior

- Always attach to the already-running dedicated Chrome instance when browser validation is needed.
- Reuse the existing login state, open tabs, and current preview context in that dedicated browser.
- Prefer reusing an already-open dedicated-browser tab for the required preview or target page instead of opening a duplicate tab.
- Close only temporary one-off research or inspection tabs that you opened for the current task. Never close the Coordex console tab itself, the long-lived preview tab, or any intentionally reused project tab unless the human explicitly asked for that cleanup. Keep login and intentionally reused project tabs open.
- Do not launch default Chrome.
- Do not create a temporary Chrome profile.
- Do not treat generic auto-connect browser flows as valid validation for this project.

## Failure Rule

- If you cannot confirm attachment to `127.0.0.1:9333`, do not claim browser validation is complete.
- Ask the human to validate in the dedicated browser and report back instead of switching to a different browser target.
