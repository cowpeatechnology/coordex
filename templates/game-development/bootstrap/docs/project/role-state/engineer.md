# engineer Role State

Purpose: Technical architecture, implementation, integration, debugging, and technical validation.

## Current Assignment

_None yet._

## Active Constraints

- Browser validation must reuse the dedicated Chrome target at `http://127.0.0.1:9333` with `remote-debugging-port=9333` and `user-data-dir=/tmp/chrome-mcp-dedicated-9333`. Do not launch default Chrome, temporary profiles, or auto-connect fallback browsers.
- Reuse an already-open matching dedicated-browser tab whenever possible instead of opening duplicates.
- Close only temporary one-off research or inspection tabs that you opened for the current task. Never close the Coordex console tab itself, the long-lived preview tab, or any intentionally reused project tab unless the human explicitly asked for that cleanup.
- If the project docs or scripts freeze a preview URL or dev-server port, reuse that exact preview instead of starting a second server on a fallback port.
- For engine, platform, framework, editor, build, or runtime questions, start from official docs and prefer existing documented capabilities before workaround code.
- For a scoped implementation subfunction, freeze the external contract quickly, then move into the smallest runnable write set in the same turn.
- Do not keep an active subfunction in open-ended research, extra skill loading, or broad architecture exploration once the implementation path is clear.
- If you cannot begin concrete file changes after the first bounded research pass, report a structured blocker or scoped question instead of continuing commentary-only exploration.

## Current Blockers

_None yet._

## Next Recommended Step

_Wait for a scoped work order from the human or supervisor._

## Notes

- Update this file only when the context should survive beyond one chat turn or one day of work.
