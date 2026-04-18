import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { AgentProjectTemplate } from "../shared/agents.js";

type RoleStateSeed = {
  key: string;
  label: string;
  purpose: string;
};

type ProjectBootstrapOptions = {
  projectName?: string;
  projectTemplate?: AgentProjectTemplate;
  roleStateSeeds?: RoleStateSeed[];
};

const ensureParentDir = (path: string): void => {
  mkdirSync(dirname(path), { recursive: true });
};

const writeIfMissing = (path: string, content: string): void => {
  if (existsSync(path)) {
    return;
  }

  ensureParentDir(path);
  writeFileSync(path, `${content.trimEnd()}\n`, "utf8");
};

const buildRootAgentsContent = (projectName?: string): string => {
  const normalizedName = projectName?.trim() || "Replace with the real project name.";

  return [
    "# Project Instructions",
    "",
    "This file is the root instruction layer for this project.",
    "",
    "## Project Identity",
    "",
    `- Project: ${normalizedName}`,
    "- Purpose: Replace this line with the real product or repository purpose.",
    "- Stack summary: Replace this line with the actual languages, frameworks, runtime, and debug path.",
    "- Key directories: Replace this line with the directories that matter most.",
    "",
    "## Coordex Workflow",
    "",
    "- The human operator stays in the loop.",
    "- Durable role threads live under `Agents/<role>/` and remain visible project assets.",
    "- The supervisor owns planning, routing, scope boundaries, and final acceptance.",
    "- The supervisor plans and routes by default; it does not absorb worker-owned implementation unless the human explicitly assigns that ownership.",
    "- Each active subfunction must have exactly one implementation owner role.",
    "- The current plan is tracked in `.coordex/current-plan.md` and `.coordex/project-board.json`.",
    "- Role-local durable context belongs in `docs/project/role-state/<role>.md` instead of long chat history.",
    "- When the same missing fact causes repeated mistakes, write it back into this file or another checked-in project doc.",
    "",
    "## Required Durable Docs",
    "",
    "- `docs/project/project-method.md`",
    "- `docs/project/delivery-ledger.md`",
    "- `docs/project/thread-conversation-ledger.md`",
    "- `docs/project/decision-log.md`",
    "- `docs/process/dedicated-browser-workflow.md`",
    "- `docs/process/engineering-standards.md`",
    "- `docs/process/development-loop.md`",
    "",
    "## Project Notes To Fill In",
    "",
    "- Replace the placeholder identity lines above before the project grows.",
    "- Keep this file short and factual.",
    "- Put changing execution state in plan, ledger, and role-state files instead of bloating this root file."
  ].join("\n");
};

const buildProjectMethodContent = (): string => {
  return [
    "# Coordex Project Method",
    "",
    "This file explains the minimum working method for a project bootstrapped by Coordex.",
    "",
    "## Core Loop",
    "",
    "1. The human writes the real project identity and stack into the root `AGENTS.md`.",
    "2. The human creates durable role agents under `Agents/<role>/`.",
    "3. The supervisor owns the current goal and breaks it into subfunctions in `.coordex/current-plan.md`.",
    "4. Each subfunction has exactly one owner role, and the supervisor should not self-assign worker-owned implementation by default.",
    "5. The human or the supervisor opens the owner role thread and sends the concrete assignment.",
    "6. Worker roles reply with concise, structured handoff or result messages.",
    "7. The supervisor updates the current plan, delivery ledger, and any needed decision log entries.",
    "",
    "## Scope Rules",
    "",
    "- Do not dispatch one subfunction to two implementation roles at the same time.",
    "- Do not widen scope inside worker coordination. Escalate scope changes back to the supervisor or human.",
    "- If browser validation is required, reuse the project's dedicated Chrome workflow instead of launching an ad-hoc default browser instance.",
    "- Use durable docs for repeated context instead of relying on thread memory.",
    "",
    "## Durable Files",
    "",
    "- Root rules: `AGENTS.md`",
    "- Current plan: `.coordex/current-plan.md`",
    "- Plan history: `.coordex/plan-history.md`",
    "- Role state: `docs/project/role-state/<role>.md`",
    "- Delivery history: `docs/project/delivery-ledger.md`",
    "- Important decisions: `docs/project/decision-log.md`",
    "",
    "## First Supervisor Action",
    "",
    "If the project has no meaningful current plan yet, the supervisor's first real task is to draft the current goal and the first set of subfunctions before dispatching implementation work.",
    "",
    "The supervisor should not jump straight into implementation when a matching worker role already exists.",
    "Plan first, then route the first concrete work order to the single owner role."
  ].join("\n");
};

const buildDeliveryLedgerContent = (): string => {
  return [
    "# Delivery Ledger",
    "",
    "Record only accepted work here.",
    "",
    "## Current Release Or Milestone",
    "",
    "- Name: _Fill in_",
    "- Goal: _Fill in_",
    "- Acceptance owner: `supervisor`",
    "",
    "## Accepted Deliveries",
    "",
    "| Date | Scope | Evidence | Accepted By |",
    "| --- | --- | --- | --- |",
    "| _None yet_ | — | — | — |"
  ].join("\n");
};

const buildThreadConversationLedgerContent = (): string => {
  return [
    "# Thread Conversation Ledger",
    "",
    "Record only conversations that became durable reference points.",
    "",
    "| Role Or Thread | Why It Matters | Canonical For |",
    "| --- | --- | --- |",
    "| _None yet_ | — | — |"
  ].join("\n");
};

const buildDecisionLogContent = (): string => {
  return [
    "# Decision Log",
    "",
    "Record only decisions that change future work.",
    "",
    "## Entries",
    "",
    "- _No decisions recorded yet._"
  ].join("\n");
};

const buildEngineeringStandardsContent = (): string => {
  return [
    "# Engineering Standards",
    "",
    "These are the default standards for projects bootstrapped by Coordex.",
    "",
    "## Default Standards",
    "",
    "- Prefer small, reviewable changes over broad rewrites.",
    "- Change only the files required for the scoped task.",
    "- Validate with the real project commands whenever they are documented.",
    "- Browser validation is a hard constraint: reuse the dedicated Chrome instance at `http://127.0.0.1:9333` with remote-debugging-port `9333` and user-data-dir `/tmp/chrome-mcp-dedicated-9333`.",
    "- Do not launch default Chrome, temporary Chrome profiles, or auto-connect fallback browsers during validation.",
    "- If a command cannot be run, say so explicitly in the handoff.",
    "- Do not silently widen task scope just because a neighboring issue is visible.",
    "- When repeated context becomes necessary, write it back into checked-in docs."
  ].join("\n");
};

const buildDedicatedBrowserWorkflowContent = (): string => {
  return [
    "# Dedicated Browser Workflow",
    "",
    "This project treats dedicated-browser validation as a hard constraint, not a preference.",
    "",
    "## Fixed Target",
    "",
    "- `browserUrl`: `http://127.0.0.1:9333`",
    "- `remote-debugging-port`: `9333`",
    "- `user-data-dir`: `/tmp/chrome-mcp-dedicated-9333`",
    "",
    "## Required Behavior",
    "",
    "- Always attach to the already-running dedicated Chrome instance when browser validation is needed.",
    "- Reuse the existing login state, open tabs, and current preview context in that dedicated browser.",
    "- Do not launch default Chrome.",
    "- Do not create a temporary Chrome profile.",
    "- Do not treat generic auto-connect browser flows as valid validation for this project.",
    "",
    "## Failure Rule",
    "",
    "- If you cannot confirm attachment to `127.0.0.1:9333`, do not claim browser validation is complete.",
    "- Ask the human to validate in the dedicated browser and report back instead of switching to a different browser target."
  ].join("\n");
};

const buildDevelopmentLoopContent = (): string => {
  return [
    "# Development Loop",
    "",
    "Use this loop for scoped project work.",
    "",
    "1. Read the current goal and the assigned subfunction.",
    "2. Read only the docs and files needed for that scope.",
    "3. Implement or produce the assigned result without widening scope.",
    "4. Validate using the real project path when available.",
    "5. Return a concise handoff with artifacts, validation, blockers, and next owner.",
    "6. Update durable project docs when the same missing context is likely to matter again."
  ].join("\n");
};

const buildThreadConversationProtocolContent = (): string => {
  return [
    "# Thread Conversation Protocol",
    "",
    "Use this protocol for human-to-role and supervisor-to-role task dispatches.",
    "",
    "## Recommended Dispatch Shape",
    "",
    "- Goal: what the role is trying to change or produce",
    "- Context: which files, docs, errors, or screens matter",
    "- Constraints: rules the role must follow",
    "- Done when: what must be true before the task is complete",
    "",
    "## Response Rule",
    "",
    "- Keep replies concise.",
    "- Name changed files, validation, blockers, and next owner.",
    "- If another role is needed, hand off explicitly instead of expanding scope silently."
  ].join("\n");
};

const buildStructuredProtocolContent = (): string => {
  return [
    "# Structured Agent Communication Protocol",
    "",
    "Use this JSON envelope when role-to-role or role-to-supervisor messages need to stay low-drift.",
    "",
    "## Protocol",
    "",
    "- `protocol_version`: `coordex-agent-io.v1`",
    "- `kind`: `dispatch | question | blocker | handoff | result | decision`",
    "- `status`: `open | answered | blocked | done`",
    "",
    "## Required Keys",
    "",
    "- `protocol_version`",
    "- `task_id`",
    "- `from_role`",
    "- `to_role`",
    "- `kind`",
    "- `status`",
    "- `summary`",
    "- `input`",
    "- `expected_output`",
    "- `output`",
    "",
    "## Example",
    "",
    "```json",
    "{",
    "  \"protocol_version\": \"coordex-agent-io.v1\",",
    "  \"task_id\": \"feature-001\",",
    "  \"from_role\": \"engineer\",",
    "  \"to_role\": \"supervisor\",",
    "  \"kind\": \"result\",",
    "  \"status\": \"answered\",",
    "  \"summary\": \"Implemented the scoped UI change.\",",
    "  \"input\": \"Build the current assigned subfunction.\",",
    "  \"expected_output\": \"Working UI plus validation notes.\",",
    "  \"output\": \"Updated the UI and ran the documented build command.\"",
    "}",
    "```",
    "",
    "Keep one message equal to one coordination event."
  ].join("\n");
};

const buildSupervisorWorkOrderTemplate = (): string => {
  return [
    "# Supervisor Work Order Template",
    "",
    "## Objective",
    "",
    "_What should be achieved?_",
    "",
    "## Owner",
    "",
    "`role_name`",
    "",
    "## Scope",
    "",
    "- In scope:",
    "- Out of scope:",
    "",
    "## Context",
    "",
    "- Relevant files:",
    "- Relevant docs:",
    "- Known constraints:",
    "",
    "## Done When",
    "",
    "- _List the concrete acceptance checks._",
    "",
    "## Handoff Requirements",
    "",
    "- Artifacts:",
    "- Validation:",
    "- Blockers or follow-ups:"
  ].join("\n");
};

const buildWorkerHandoffTemplate = (): string => {
  return [
    "# Worker Handoff Template",
    "",
    "## Summary",
    "",
    "_What was completed?_",
    "",
    "## Artifacts",
    "",
    "- _Changed files or produced assets_",
    "",
    "## Validation",
    "",
    "- _Commands, manual checks, or evidence_",
    "",
    "## Blockers",
    "",
    "- _None_",
    "",
    "## Next Owner",
    "",
    "`supervisor`"
  ].join("\n");
};

const buildThreadMessageTemplate = (): string => {
  return [
    "# Thread Message Template",
    "",
    "Use this as a compact human or supervisor dispatch shape.",
    "",
    "- Goal:",
    "- Context:",
    "- Constraints:",
    "- Done when:"
  ].join("\n");
};

const buildRoleStateReadme = (): string => {
  return [
    "# Role State",
    "",
    "Keep only high-value durable role context here.",
    "",
    "Use one file per role and update it when the same missing context would otherwise need to be re-explained in future conversations."
  ].join("\n");
};

const buildRoleStateContent = (seed: RoleStateSeed): string => {
  const currentAssignment =
    seed.key === "supervisor" ? "_Draft the first current goal and subfunctions when the plan is blank._" : "_None yet._";
  const activeConstraints =
    seed.key === "engineer"
      ? "_Browser validation must reuse the dedicated Chrome target at http://127.0.0.1:9333 (remote-debugging-port 9333, user-data-dir /tmp/chrome-mcp-dedicated-9333). Do not launch default Chrome or temporary profiles._"
      : "_None yet._";
  const nextRecommendedStep =
    seed.key === "supervisor"
      ? "_If `.coordex/current-plan.md` is blank, write the goal and first single-owner subfunctions before dispatching work._"
      : seed.key === "engineer"
        ? "_Wait for a scoped work order from the human or supervisor._"
        : "_None yet._";

  return [
    `# ${seed.label} Role State`,
    "",
    `Purpose: ${seed.purpose}`,
    "",
    "## Current Assignment",
    "",
    currentAssignment,
    "",
    "## Active Constraints",
    "",
    activeConstraints,
    "",
    "## Current Blockers",
    "",
    "_None yet._",
    "",
    "## Next Recommended Step",
    "",
    nextRecommendedStep,
    "",
    "## Notes",
    "",
    "- Update this file only when the context should survive beyond one chat turn or one day of work."
  ].join("\n");
};

const buildProjectConfigContent = (): string => {
  return [
    "# Coordex project-scoped Codex config",
    "",
    "[features]",
    "codex_hooks = true"
  ].join("\n");
};

const buildSessionStartHooksContent = (): string => {
  const command = "/bin/sh -lc 'd=\"$PWD\"; while [ \"$d\" != \"/\" ]; do if [ -f \"$d/.codex/hooks/session-start-context.mjs\" ]; then exec node \"$d/.codex/hooks/session-start-context.mjs\"; fi; d=$(dirname \"$d\"); done; exit 0'";
  return JSON.stringify(
    {
      hooks: {
        SessionStart: [
          {
            matcher: "startup|resume",
            hooks: [
              {
                type: "command",
                command,
                statusMessage: "Loading Coordex project context"
              }
            ]
          }
        ]
      }
    },
    null,
    2
  );
};

const buildSessionStartScriptContent = (): string => {
  return [
    "import { existsSync, readFileSync } from \"node:fs\";",
    "import { dirname, relative, resolve } from \"node:path\";",
    "import { fileURLToPath } from \"node:url\";",
    "",
    "const scriptPath = fileURLToPath(import.meta.url);",
    "const projectRoot = dirname(dirname(dirname(scriptPath)));",
    "",
    "const readStdin = async () => {",
    "  let data = \"\";",
    "  for await (const chunk of process.stdin) {",
    "    data += chunk;",
    "  }",
    "  return data.trim();",
    "};",
    "",
    "const readFile = (path) => {",
    "  if (!existsSync(path)) return \"\";",
    "  return readFileSync(path, \"utf8\");",
    "};",
    "",
    "const parseBulletField = (content, field) => {",
    "  const match = content.match(new RegExp(`^- ${field}:\\\\s*(.+)$`, \"m\"));",
    "  return match ? match[1].trim().replace(/^`/, \"\").replace(/`$/, \"\") : \"\";",
    "};",
    "",
    "const extractSection = (content, heading) => {",
    "  const marker = `## ${heading}`;",
    "  const start = content.indexOf(marker);",
    "  if (start === -1) return \"\";",
    "  const afterMarker = content.slice(start + marker.length).replace(/^\\\\s+/, \"\");",
    "  const nextSection = afterMarker.indexOf(\"\\n## \");",
    "  const raw = nextSection === -1 ? afterMarker : afterMarker.slice(0, nextSection);",
    "  return raw.trim();",
    "};",
    "",
    "const firstMeaningfulLine = (value) => {",
    "  return value",
    "    .split(/\\\\r?\\\\n/)",
    "    .map((line) => line.trim())",
    "    .find((line) => line && !line.startsWith(\"#\") && line !== \"_None yet._\" && line !== \"_No goal yet._\" && line !== \"_No subfunctions yet._\") ?? \"\";",
    "};",
    "",
    "const extractPlanGoal = (content) => firstMeaningfulLine(extractSection(content, \"Goal\"));",
    "",
    "const extractNextOpenSubfunction = (content) => {",
    "  const match = content.match(/^- \\[ \\] (.+)$/m);",
    "  return match ? match[1].trim() : \"\";",
    "};",
    "",
    "const normalize = (value) => value.replace(/\\\\/g, \"/\");",
    "",
    "const detectRoleKey = (cwd) => {",
    "  const relativeCwd = normalize(relative(projectRoot, cwd));",
    "  const segments = relativeCwd.split(\"/\").filter(Boolean);",
    "  const agentsIndex = segments.indexOf(\"Agents\");",
    "  if (agentsIndex === -1) return \"\";",
    "  return segments[agentsIndex + 1] ?? \"\";",
    "};",
    "",
    "const main = async () => {",
    "  const stdin = await readStdin();",
    "  let payload = {};",
    "  if (stdin) {",
    "    try {",
    "      payload = JSON.parse(stdin);",
    "    } catch {",
    "      payload = {};",
    "    }",
    "  }",
    "",
    "  const sessionCwd = typeof payload.cwd === \"string\" && payload.cwd ? resolve(payload.cwd) : projectRoot;",
    "  const roleKey = detectRoleKey(sessionCwd);",
    "  const rootAgents = readFile(resolve(projectRoot, \"AGENTS.md\"));",
    "  const currentPlan = readFile(resolve(projectRoot, \".coordex/current-plan.md\"));",
    "  const roleState = roleKey ? readFile(resolve(projectRoot, `docs/project/role-state/${roleKey}.md`)) : \"\";",
    "",
    "  const projectName = parseBulletField(rootAgents, \"Project\");",
    "  const projectPurpose = parseBulletField(rootAgents, \"Purpose\");",
    "  const stackSummary = parseBulletField(rootAgents, \"Stack summary\");",
    "  const currentGoal = extractPlanGoal(currentPlan);",
    "  const nextSubfunction = extractNextOpenSubfunction(currentPlan);",
    "  const currentAssignment = firstMeaningfulLine(extractSection(roleState, \"Current Assignment\"));",
    "  const currentBlocker = firstMeaningfulLine(extractSection(roleState, \"Current Blockers\"));",
    "",
    "  const parts = [];",
    "  if (roleKey) parts.push(`Role: ${roleKey}.`);",
    "  if (projectName) parts.push(`Project: ${projectName}.`);",
    "  if (projectPurpose) parts.push(`Purpose: ${projectPurpose}.`);",
    "  if (stackSummary) parts.push(`Stack: ${stackSummary}.`);",
    "  if (currentGoal) parts.push(`Current goal: ${currentGoal}.`);",
    "  if (nextSubfunction) parts.push(`Next open subfunction: ${nextSubfunction}.`);",
    "  if (currentAssignment) parts.push(`Current assignment: ${currentAssignment}.`);",
    "  if (currentBlocker) parts.push(`Current blocker: ${currentBlocker}.`);",
    "  if (roleKey === \"supervisor\" && !currentGoal) {",
    "    parts.push(\"Supervisor rule: if the current plan is blank, write the goal and first single-owner subfunctions before dispatching or implementing work.\");",
    "  }",
    "  if (roleKey === \"supervisor\") {",
    "    parts.push(\"Supervisor rule: do not implement engineer-owned or art-owned scope yourself unless the human explicitly assigns supervisor as the implementation owner.\");",
    "  }",
    "  if (roleKey === \"engineer\") {",
    "    parts.push(\"Engineer rule: wait for a scoped work order from the human or supervisor before starting implementation.\");",
    "    parts.push(\"Engineer browser rule: browser validation must reuse the dedicated Chrome target at http://127.0.0.1:9333 with remote-debugging-port 9333 and user-data-dir /tmp/chrome-mcp-dedicated-9333. Never launch default Chrome or temporary profiles.\");",
    "  }",
    "",
    "  const rereadPaths = [\"AGENTS.md\", \".coordex/current-plan.md\"];",
    "  if (roleKey) rereadPaths.push(`docs/project/role-state/${roleKey}.md`);",
    "  rereadPaths.push(\"docs/project/project-method.md\");",
    "  parts.push(`Before widening scope, re-read: ${rereadPaths.join(\", \")}.`);",
    "",
    "  const additionalContext = parts.join(\" \").replace(/\\s+/g, \" \").trim();",
    "  if (!additionalContext) return;",
    "",
    "  process.stdout.write(JSON.stringify({",
    "    hookSpecificOutput: {",
    "      hookEventName: \"SessionStart\",",
    "      additionalContext: additionalContext.slice(0, 1400)",
    "    }",
    "  }));",
    "};",
    "",
    "await main();"
  ].join("\n");
};

export function ensureProjectInitializationPackage(projectRoot: string, options: ProjectBootstrapOptions = {}): void {
  writeIfMissing(resolve(projectRoot, "AGENTS.md"), buildRootAgentsContent(options.projectName));

  writeIfMissing(resolve(projectRoot, ".codex/config.toml"), buildProjectConfigContent());
  writeIfMissing(resolve(projectRoot, ".codex/hooks.json"), buildSessionStartHooksContent());
  writeIfMissing(resolve(projectRoot, ".codex/hooks/session-start-context.mjs"), buildSessionStartScriptContent());

  writeIfMissing(resolve(projectRoot, "docs/project/project-method.md"), buildProjectMethodContent());
  writeIfMissing(resolve(projectRoot, "docs/project/delivery-ledger.md"), buildDeliveryLedgerContent());
  writeIfMissing(resolve(projectRoot, "docs/project/thread-conversation-ledger.md"), buildThreadConversationLedgerContent());
  writeIfMissing(resolve(projectRoot, "docs/project/decision-log.md"), buildDecisionLogContent());

  writeIfMissing(resolve(projectRoot, "docs/process/dedicated-browser-workflow.md"), buildDedicatedBrowserWorkflowContent());
  writeIfMissing(resolve(projectRoot, "docs/process/engineering-standards.md"), buildEngineeringStandardsContent());
  writeIfMissing(resolve(projectRoot, "docs/process/development-loop.md"), buildDevelopmentLoopContent());
  writeIfMissing(resolve(projectRoot, "docs/process/thread-conversation-protocol.md"), buildThreadConversationProtocolContent());
  writeIfMissing(
    resolve(projectRoot, "docs/process/structured-agent-communication-protocol.md"),
    buildStructuredProtocolContent()
  );

  writeIfMissing(resolve(projectRoot, "docs/templates/supervisor-work-order-template.md"), buildSupervisorWorkOrderTemplate());
  writeIfMissing(resolve(projectRoot, "docs/templates/worker-handoff-template.md"), buildWorkerHandoffTemplate());
  writeIfMissing(resolve(projectRoot, "docs/templates/thread-message-template.md"), buildThreadMessageTemplate());

  writeIfMissing(resolve(projectRoot, "docs/project/role-state/README.md"), buildRoleStateReadme());

  const roleStateSeeds = options.roleStateSeeds ?? options.projectTemplate?.roles.map((role) => ({
    key: role.directoryName,
    label: role.label,
    purpose: role.description
  })) ?? [];

  for (const seed of roleStateSeeds) {
    writeIfMissing(resolve(projectRoot, `docs/project/role-state/${seed.key}.md`), buildRoleStateContent(seed));
  }
}
