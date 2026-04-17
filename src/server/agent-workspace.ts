import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import {
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
};

export function resolveAgentWorkspace(
  projectRoot: string,
  input: {
    projectTemplateKey?: string;
    templateKey?: string;
    roleName?: string;
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
  ensureRoleInstructions(cwd, roleName, projectTemplate, roleTemplate);

  return {
    roleName,
    roleDirectory: `${projectTemplate.directoryName}/${roleDirectoryName}`,
    cwd,
    chatTitle: roleTemplate?.defaultChatTitle ?? roleName
  };
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

  const content = `# Agents Directory

These instructions apply to every Codex thread started under this directory. The project root AGENTS.md still applies first.

- Directory: \`${projectTemplate.directoryName}\`
- Template: \`${projectTemplate.key}\`
- Purpose: ${projectTemplate.description}
- Keep one role per subdirectory under this folder.
- Use English directory names that are stable and machine-safe.
- Put role-local behavior in \`AGENTS.override.md\` inside the role directory instead of overloading this shared layer.
- Default collaboration expectation: supervisor-routed coordination instead of cross-role direct messaging.
`;

  writeFileSync(agentsPath, content, "utf8");
}

function ensureRoleInstructions(
  cwd: string,
  roleName: string,
  projectTemplate: AgentProjectTemplate,
  roleTemplate?: AgentRoleTemplate
): void {
  const overridePath = resolve(cwd, "AGENTS.override.md");
  const baseAgentsPath = resolve(cwd, "AGENTS.md");
  if (existsSync(overridePath) || existsSync(baseAgentsPath)) {
    return;
  }

  const description = roleTemplate?.description ?? "Role-specific operating notes for this directory.";
  const templateLabel = roleTemplate?.key ?? "custom";

  const content = `# ${roleName} Role Override

These instructions apply to Codex threads started in this directory. The project root AGENTS.md and parent \`${projectTemplate.directoryName}/AGENTS.md\` still apply first; this file only adds role-local behavior.

- Role: \`${roleName}\`
- Template: \`${projectTemplate.key}/${templateLabel}\`
- Purpose: ${description}
- Keep role-specific handoff notes, work habits, and acceptance rules here.
- Do not restate project-wide architecture rules here unless this role truly needs a stronger local override.
`;

  writeFileSync(overridePath, content, "utf8");
}
