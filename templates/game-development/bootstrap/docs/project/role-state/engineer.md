# engineer Role State

Purpose: Technical architecture, implementation, integration, debugging, and technical validation.

## Current Assignment

_None yet._

## Active Constraints

- Browser validation must reuse the dedicated Chrome target at `http://127.0.0.1:9333` with `remote-debugging-port=9333` and `user-data-dir=/tmp/chrome-mcp-dedicated-9333`. Do not launch default Chrome, temporary profiles, or auto-connect fallback browsers.
- Reuse an already-open matching dedicated-browser tab whenever possible instead of opening duplicates.
- For engine, platform, framework, editor, build, or runtime questions, start from official docs and prefer existing documented capabilities before workaround code.

## Current Blockers

_None yet._

## Next Recommended Step

_Wait for a scoped work order from the human or supervisor._

## Notes

- Update this file only when the context should survive beyond one chat turn or one day of work.
