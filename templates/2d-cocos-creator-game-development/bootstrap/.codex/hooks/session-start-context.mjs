import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const projectRoot = dirname(dirname(dirname(scriptPath)));
const runtimeDir = resolve(projectRoot, ".coordex/runtime");
const sessionStartLastPath = resolve(runtimeDir, "session-start-last.json");
const sessionStartLogPath = resolve(runtimeDir, "session-start-events.jsonl");

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

const writeSessionStartMarker = (payload, sessionCwd, roleKey) => {
  try {
    mkdirSync(runtimeDir, { recursive: true });

    const marker = {
      hookEventName: "SessionStart",
      detectedAt: new Date().toISOString(),
      source: typeof payload.source === "string" ? payload.source : null,
      sessionId: typeof payload.session_id === "string" ? payload.session_id : null,
      transcriptPath: typeof payload.transcript_path === "string" ? payload.transcript_path : null,
      cwd: sessionCwd,
      model: typeof payload.model === "string" ? payload.model : null,
      roleKey: roleKey || null,
      projectRoot
    };

    writeFileSync(sessionStartLastPath, `${JSON.stringify(marker, null, 2)}\n`, "utf8");
    appendFileSync(sessionStartLogPath, `${JSON.stringify(marker)}\n`, "utf8");
  } catch {
    // Marker logging must never break the hook itself.
  }
};

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
  writeSessionStartMarker(payload, sessionCwd, roleKey);
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
  if (currentGoal) parts.push(`Current goal: ${currentGoal}.`);
  if (nextSubfunction) parts.push(`Next open subfunction: ${nextSubfunction}.`);
  if (currentAssignment) parts.push(`Current assignment: ${currentAssignment}.`);
  if (currentBlocker) parts.push(`Current blocker: ${currentBlocker}.`);
  if (projectName) parts.push(`Project: ${projectName}.`);
  if (projectPurpose) parts.push(`Purpose: ${projectPurpose}.`);
  if (stackSummary) parts.push(`Stack: ${stackSummary}.`);
  if (roleKey === "supervisor" && !currentGoal) {
    parts.push("Supervisor rule: if the current plan is blank, write the goal and first single-owner subfunctions before dispatching or implementing work.");
    parts.push("Supervisor planning rule: do not block that first plan on deeper engine or framework research; route technical uncertainty into engineer-owned validation or implementation subfunctions.");
  }
  if (roleKey === "supervisor") {
    parts.push("Supervisor rule: do not implement engineer-owned or art-owned scope yourself unless the human explicitly assigns supervisor as the implementation owner.");
    parts.push("Supervisor contract rule: freeze official platform/editor/build facts only when routing or acceptance needs them, and prefer editor/config plus simple validation before approving code fallback.");
    parts.push("Supervisor plan-format rule: if the human wants Chinese plan display, localize only the goal body and subfunction display titles. Keep the machine-readable plan tokens `Goal`, `Subfunctions`, `Description`, `Coordination`, `Notes`, `Created`, and `Updated` in English, and keep protocol fields unchanged.");
  }
  parts.push("Browser rule: if browser validation is required, any Chrome DevTools or MCP browser session is valid only when attached to http://127.0.0.1:9333. Auto-connect or default-profile browser sessions are invalid for this project.");
  parts.push("Browser tab rule: prefer reusing an already-open dedicated-browser tab for the target preview or page instead of opening duplicate tabs.");
  parts.push("Browser cleanup rule: close only temporary one-off research or inspection tabs that you opened for the current task. Never close the Coordex planning console tab itself, the long-lived preview tab, or any intentionally reused project tab unless the human explicitly asks for that cleanup.");
  if (roleKey === "engineer") {
    parts.push("Engineer rule: wait for a scoped work order from the human or supervisor before starting implementation.");
    parts.push("Engineer browser rule: browser validation must reuse the dedicated Chrome target at http://127.0.0.1:9333 with remote-debugging-port 9333 and user-data-dir /tmp/chrome-mcp-dedicated-9333. Reuse already-open matching tabs whenever possible. If chrome-devtools MCP is available, it must use --browser-url=http://127.0.0.1:9333 and never --autoConnect.");
    parts.push("Engineer preview rule: if the project docs, scripts, or README freeze a preview URL or dev-server port, reuse that exact preview and do not silently accept fallback ports from duplicate dev-server launches.");
    parts.push("Engineer contract rule: for engine/platform/editor/build tasks, follow official docs -> editor/config -> human assist -> code fallback.");
    parts.push("Engineer environment rule: local browser preview is not the real mini-game container; mark platform-only results as environment-limited when needed.");
    parts.push("Engineer refresh rule: after Cocos scene/component/script edits, save and wait briefly; if external file edits look stale, use the documented reimport/refresh/reload path before assuming failure.");
    parts.push("Engineer asset-boundary rule: keep generator scripts, preview sheets, and spec docs out of runtime assets unless the game loads them.");
    parts.push("Engineer execution rule: for a scoped implementation subfunction, do one bounded contract-freeze pass, then move into the smallest runnable write set in the same turn.");
    parts.push("Engineer anti-drift rule: do not stay in open-ended research, extra skill loading, or broad architecture exploration once the implementation path is clear. If writing cannot start, report a structured blocker.");
  }
  if (roleKey === "art_asset_producer") {
    parts.push("Art asset rule: keep generators, prompt notes, previews, and spec docs outside runtime assets; hand off integration-ready assets with exact variants, sizes, and formats.");
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
