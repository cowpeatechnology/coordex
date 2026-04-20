## Coordex Workflow

<!-- COORDEX:PROJECT-WORKFLOW:START -->
This block is maintained by Coordex from the `{{PROJECT_TEMPLATE_KEY}}` template. Keep project-specific identity facts elsewhere in the root file; keep repeatable coordination rules here or in the referenced durable docs.

- Template: `{{PROJECT_TEMPLATE_LABEL}}`
- Durable role threads live under `{{AGENTS_DIRECTORY_NAME}}/<role>/`.
- The supervisor owns planning, routing, scope boundaries, and final acceptance.
- The supervisor plans and routes by default; it does not absorb worker-owned implementation unless the human explicitly assigns that ownership.
- Each active subfunction must have exactly one implementation owner role.
- The current plan is tracked in `.coordex/current-plan.md` and `.coordex/project-board.json`.
- Role-local durable context belongs in `docs/project/role-state/<role>.md` instead of long chat history.
- When the same missing fact causes repeated mistakes, write it back into this file or another checked-in project doc.

### Default Roles

- `supervisor`: product owner, milestone planner, dispatcher, and final accepter.
- `engineer`: technical architecture, implementation, integration, debugging, and technical validation.
- `art_asset_producer`: visual direction, asset planning, and asset production for assigned scope.

### Required Durable Docs

- `docs/project/project-method.md`
- `docs/project/delivery-ledger.md`
- `docs/project/thread-conversation-ledger.md`
- `docs/project/decision-log.md`
- `docs/process/dedicated-browser-workflow.md`
- `docs/process/engineering-standards.md`
- `docs/process/development-loop.md`
- `docs/process/structured-agent-communication-protocol.md`

### Template-Specific Expectations

- This template assumes a 2D Cocos Creator game workflow unless project-specific docs later narrow the stack further.
- Browser validation is only valid when attached to the dedicated Chrome instance at `http://127.0.0.1:9333`.
- Keep changing execution state in plan, ledger, and role-state files instead of bloating the root `AGENTS.md`.
<!-- COORDEX:PROJECT-WORKFLOW:END -->
