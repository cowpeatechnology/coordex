# Engineering Standards

These are the default standards for projects bootstrapped by Coordex.

## Default Standards

- Prefer small, reviewable changes over broad rewrites.
- Change only the files required for the scoped task.
- Validate with the real project commands whenever they are documented.
- Browser validation is a hard constraint: reuse the dedicated Chrome instance at `http://127.0.0.1:9333` with remote-debugging-port `9333` and user-data-dir `/tmp/chrome-mcp-dedicated-9333`.
- Reuse already-open dedicated-browser tabs whenever they already show the needed preview or page. Do not multiply tabs without need.
- Do not launch default Chrome, temporary Chrome profiles, or auto-connect fallback browsers during validation.
- If a command cannot be run, say so explicitly in the handoff.
- Do not silently widen task scope just because a neighboring issue is visible.
- When repeated context becomes necessary, write it back into checked-in docs.
