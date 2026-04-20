import { existsSync, readFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = dirname(dirname(dirname(scriptPath)));

const readStdin = async () => {
  let data = "";
  for await (const chunk of process.stdin) {
    data += chunk;
  }
  return data.trim();
};

const readFile = (path) => {
  if (!existsSync(path)) return "";
  return readFileSync(path, "utf8");
};

const parseBulletField = (content, field) => {
  const match = content.match(new RegExp(`^- ${field}:\\s*(.+)$`, "m"));
  return match ? match[1].trim().replace(/^`/, "").replace(/`$/, "") : "";
};

const extractSection = (content, heading) => {
  const marker = `## ${heading}`;
  const start = content.indexOf(marker);
  if (start === -1) return "";
  const afterMarker = content.slice(start + marker.length).replace(/^\s+/, "");
  const nextSection = afterMarker.indexOf("\n## ");
  const raw = nextSection === -1 ? afterMarker : afterMarker.slice(0, nextSection);
  return raw.trim();
};

const firstMeaningfulLine = (value) => {
  return value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => line && !line.startsWith("#") && line !== "_None yet._" && line !== "_No goal yet._" && line !== "_No subfunctions yet._") ?? "";
};

const extractPlanGoal = (content) => firstMeaningfulLine(extractSection(content, "Goal"));

const extractNextOpenSubfunction = (content) => {
  const match = content.match(/^- \[ \] (.+)$/m);
  return match ? match[1].trim() : "";
};

const normalize = (value) => value.replace(/\\/g, "/");

const detectRoleKey = (cwd) => {
  const relativeCwd = normalize(relative(projectRoot, cwd));
  const segments = relativeCwd.split("/").filter(Boolean);
  const agentsIndex = segments.indexOf("Agents");
  if (agentsIndex === -1) return "";
  return segments[agentsIndex + 1] ?? "";
};

const main = async () => {
  const stdin = await readStdin();
  let payload = {};
  if (stdin) {
    try {
      payload = JSON.parse(stdin);
    } catch {
      payload = {};
    }
  }

  const sessionCwd = typeof payload.cwd === "string" && payload.cwd ? resolve(payload.cwd) : projectRoot;
  const roleKey = detectRoleKey(sessionCwd);
  const rootAgents = readFile(resolve(projectRoot, "AGENTS.md"));
  const currentPlan = readFile(resolve(projectRoot, ".coordex/current-plan.md"));
  const roleState = roleKey ? readFile(resolve(projectRoot, `docs/project/role-state/${roleKey}.md`)) : "";

  const projectName = parseBulletField(rootAgents, "Project");
  const projectPurpose = parseBulletField(rootAgents, "Purpose");
  const stackSummary = parseBulletField(rootAgents, "Stack summary");
  const currentGoal = extractPlanGoal(currentPlan);
  const nextSubfunction = extractNextOpenSubfunction(currentPlan);
  const currentAssignment = firstMeaningfulLine(extractSection(roleState, "Current Assignment"));
  const currentBlocker = firstMeaningfulLine(extractSection(roleState, "Current Blockers"));

  const parts = [];
  if (roleKey) parts.push(`Role: ${roleKey}.`);
  if (projectName) parts.push(`Project: ${projectName}.`);
  if (projectPurpose) parts.push(`Purpose: ${projectPurpose}.`);
  if (stackSummary) parts.push(`Stack: ${stackSummary}.`);
  if (currentGoal) parts.push(`Current goal: ${currentGoal}.`);
  if (nextSubfunction) parts.push(`Next open subfunction: ${nextSubfunction}.`);
  if (currentAssignment) parts.push(`Current assignment: ${currentAssignment}.`);
  if (currentBlocker) parts.push(`Current blocker: ${currentBlocker}.`);
  if (roleKey === "supervisor" && !currentGoal) {
    parts.push("Supervisor rule: if the current plan is blank, write the goal and first single-owner subfunctions before dispatching or implementing work.");
  }
  if (roleKey === "supervisor") {
    parts.push("Supervisor rule: do not implement engineer-owned or art-owned scope yourself unless the human explicitly assigns supervisor as the implementation owner.");
  }
  parts.push("Browser rule: if browser validation is required, any Chrome DevTools or MCP browser session is valid only when attached to http://127.0.0.1:9333. Auto-connect or default-profile browser sessions are invalid for this project.");
  parts.push("Browser tab rule: prefer reusing an already-open dedicated-browser tab for the target preview or page instead of opening duplicate tabs.");
  if (roleKey === "engineer") {
    parts.push("Engineer rule: wait for a scoped work order from the human or supervisor before starting implementation.");
    parts.push("Engineer browser rule: browser validation must reuse the dedicated Chrome target at http://127.0.0.1:9333 with remote-debugging-port 9333 and user-data-dir /tmp/chrome-mcp-dedicated-9333. Reuse already-open matching tabs whenever possible. If chrome-devtools MCP is available, it must use --browser-url=http://127.0.0.1:9333 and never --autoConnect.");
  }

  const rereadPaths = ["AGENTS.md", ".coordex/current-plan.md"];
  if (roleKey) rereadPaths.push(`docs/project/role-state/${roleKey}.md`);
  rereadPaths.push("docs/project/project-method.md");
  parts.push(`Before widening scope, re-read: ${rereadPaths.join(", ")}.`);

  const additionalContext = parts.join(" ").replace(/\s+/g, " ").trim();
  if (!additionalContext) return;

  process.stdout.write(JSON.stringify({
    hookSpecificOutput: {
      hookEventName: "SessionStart",
      additionalContext: additionalContext.slice(0, 1400)
    }
  }));
};

await main();
