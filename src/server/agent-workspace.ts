import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  DEFAULT_AGENTS_DIRECTORY_NAME,
  resolveAgentProjectTemplate,
  resolveAgentRoleTemplate,
  type AgentProjectTemplate,
  type AgentRoleTemplate
} from "../shared/agents.js";

type AgentWorkspace = {
  roleName: string;
  roleDirectory: string;
  cwd: string;
  chatTitle: string;
  projectTemplate: AgentProjectTemplate;
  roleTemplate?: AgentRoleTemplate;
};

export function resolveAgentWorkspace(
  projectRoot: string,
  input: {
    projectTemplateKey?: string;
    templateKey?: string;
    roleName?: string;
    rolePurpose?: string;
  }
): AgentWorkspace {
  const projectTemplate = resolveAgentProjectTemplate(input.projectTemplateKey);
  const roleTemplate = resolveAgentRoleTemplate(projectTemplate, input.templateKey);
  const roleName = roleTemplate?.label ?? input.roleName?.trim() ?? "";
  if (!roleName) {
    throw new Error("Role name is required.");
  }

  const roleDirectoryName = roleTemplate?.directoryName ?? normalizeRoleDirectoryName(roleName);
  if (!roleDirectoryName) {
    throw new Error("Role name could not be converted into a safe directory name.");
  }

  const agentsRoot = resolve(projectRoot, projectTemplate.directoryName);
  mkdirSync(agentsRoot, { recursive: true });
  ensureAgentsDirectoryInstructions(agentsRoot, projectTemplate);

  const cwd = resolve(agentsRoot, roleDirectoryName);
  mkdirSync(cwd, { recursive: true });
  ensureRoleInstructions(cwd, roleName, projectTemplate, roleTemplate, input.rolePurpose);

  return {
    roleName,
    roleDirectory: `${projectTemplate.directoryName}/${roleDirectoryName}`,
    cwd,
    chatTitle: roleTemplate?.defaultChatTitle ?? roleName,
    projectTemplate,
    roleTemplate
  };
}

export function cleanupAgentWorkspace(projectRoot: string, roleDirectory: string): void {
  const rolePath = resolve(projectRoot, roleDirectory);
  rmSync(rolePath, { recursive: true, force: true });

  const agentsRoot = resolve(projectRoot, DEFAULT_AGENTS_DIRECTORY_NAME);
  if (!existsSync(agentsRoot)) {
    return;
  }

  const visibleEntries = readdirSync(agentsRoot, { withFileTypes: true }).filter((entry) => !entry.name.startsWith("."));
  const hasRoleDirectories = visibleEntries.some((entry) => entry.isDirectory());

  if (!hasRoleDirectories) {
    rmSync(resolve(agentsRoot, "AGENTS.md"), { force: true });
    const remainingEntries = readdirSync(agentsRoot, { withFileTypes: true }).filter((entry) => !entry.name.startsWith("."));
    if (!remainingEntries.length) {
      rmSync(agentsRoot, { recursive: true, force: true });
    }
  }
}

function normalizeRoleDirectoryName(value: string): string {
  return value
    .trim()
    .replace(/[\\/:"*?<>|]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/^\.+$/, "")
    .replace(/^-+/, "")
    .replace(/-+$/, "");
}

function ensureAgentsDirectoryInstructions(cwd: string, projectTemplate: AgentProjectTemplate): void {
  const agentsPath = resolve(cwd, "AGENTS.md");
  if (existsSync(agentsPath)) {
    return;
  }

  const content = [
    "# Agents Directory",
    "",
    "These instructions apply to every Codex thread started under this directory. The project root AGENTS.md still applies first.",
    "",
    `- Directory: \`${projectTemplate.directoryName}\``,
    `- Template: \`${projectTemplate.key}\``,
    `- Purpose: ${projectTemplate.description}`,
    "- Keep one role per subdirectory under this folder.",
    "- Use English directory names that are stable and machine-safe.",
    "- Put role-local behavior in `AGENTS.md` inside the role directory instead of overloading this shared layer.",
    "",
    "## Shared Coordination Rules",
    "",
    ...projectTemplate.sharedRoleRules.map((rule) => `- ${rule}`),
    "",
    "## Shared Startup Docs",
    "",
    "Read these before non-trivial work if they exist:",
    "",
    ...projectTemplate.sharedStartupDocCandidates.map((path) => `- \`${path}\``),
    "",
    "If a listed file is missing, continue with the files that do exist."
  ].join("\n");

  writeFileSync(agentsPath, content, "utf8");
}

function ensureRoleInstructions(
  cwd: string,
  roleName: string,
  projectTemplate: AgentProjectTemplate,
  roleTemplate?: AgentRoleTemplate,
  rolePurpose?: string
): void {
  const roleAgentsPath = resolve(cwd, "AGENTS.md");
  const legacyRoleOverridePath = resolve(cwd, "AGENTS.override.md");
  if (existsSync(roleAgentsPath) || existsSync(legacyRoleOverridePath)) {
    return;
  }

  const description = rolePurpose?.trim() || roleTemplate?.description || "Role-specific operating notes for this directory.";
  const templateLabel = roleTemplate?.key ?? "custom";
  const roleMission = roleTemplate?.mission ?? [
    "Own the responsibility described in the role purpose for the scoped work that lands in this directory.",
    "Keep stable role behavior here and move changing project facts into the project docs instead of chat memory."
  ];
  const roleOperatingRules = roleTemplate?.operatingRules ?? [
    "Use this file for durable role behavior, not for per-task scope that will immediately drift.",
    "Before non-trivial work, read the relevant project docs instead of guessing missing context.",
    "Escalate missing authority or unclear ownership back to the human or supervisor."
  ];
  const handoffContract = roleTemplate?.handoffContract ?? [
    "Return concise handoffs that say what changed, how it was validated, and what still blocks completion.",
    "If the next owner needs durable context, ask for it to be written into project docs rather than relying on ephemeral memory."
  ];
  const startupDocs = roleTemplate?.startupDocCandidates ?? [];

  const content = [
    `# ${roleName} Role Instructions`,
    "",
    `These instructions apply to Codex threads started in this directory. The project root AGENTS.md and parent \`${projectTemplate.directoryName}/AGENTS.md\` still apply first; this file only adds role-local behavior.`,
    "",
    `- Role: \`${roleName}\``,
    `- Template: \`${projectTemplate.key}/${templateLabel}\``,
    `- Purpose: ${description}`,
    "- Keep stable role behavior here. Put changing milestone details, current tasks, and temporary constraints into project docs or task prompts instead.",
    "",
    "## Mission",
    "",
    ...roleMission.map((entry) => `- ${entry}`),
    "",
    "## Operating Rules",
    "",
    ...roleOperatingRules.map((entry) => `- ${entry}`),
    "",
    "## Default Project Docs",
    "",
    startupDocs.length
      ? "Read these before non-trivial work if they exist:"
      : "No role-specific default docs are configured for this template.",
    ...startupDocs.map((path) => `- \`${path}\``),
    startupDocs.length ? "" : "",
    "## Handoff Contract",
    "",
    ...handoffContract.map((entry) => `- ${entry}`)
  ]
    .filter(Boolean)
    .join("\n");

  writeFileSync(roleAgentsPath, content, "utf8");
}
