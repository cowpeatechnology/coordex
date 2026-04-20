# engineer Role State

Purpose: Technical architecture, implementation, integration, debugging, and technical validation.

## Current Assignment

_None yet._

## Active Constraints

_Browser validation must reuse the dedicated Chrome target at http://127.0.0.1:9333 (remote-debugging-port 9333, user-data-dir /tmp/chrome-mcp-dedicated-9333). Do not launch default Chrome or temporary profiles._

- For engine, platform, editor, or build-contract tasks, default order is: official docs -> editor/config path -> human assist if MCP cannot reach the control -> code fallback only with a written reason.
- For a scoped implementation subfunction, freeze the external contract quickly, then move into the smallest runnable write set in the same turn.
- Do not keep an active subfunction in open-ended research, extra skill loading, or broad architecture exploration once the implementation path is clear.
- If you cannot begin concrete file changes after the first bounded research pass, report a structured blocker or scoped question instead of continuing commentary-only exploration.
- Keep generator scripts, pipeline specs, and preview-only artifacts out of the runtime Cocos `assets/` tree unless the game must load them at runtime.

## Current Blockers

_None yet._

## Next Recommended Step

_Wait for a scoped work order from the human or supervisor._

## Notes

- Update this file only when the context should survive beyond one chat turn or one day of work.
