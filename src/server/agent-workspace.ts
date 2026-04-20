import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import { DEFAULT_AGENTS_DIRECTORY_NAME, type AgentRoleTemplate } from "../shared/agents.js";
import {
  buildTemplateRenderVariables,
  getAgentsDirectoryTemplatePath,
  getCustomRoleInstructionTemplatePath,
  getRoleInstructionTemplatePath,
  renderTemplateText,
  resolveAgentProjectTemplate,
  resolveAgentRoleTemplate,
  type LoadedAgentProjectTemplate
} from "./template-loader.js";

type AgentWorkspace = {
  roleName: string;
  roleDirectory: string;
  cwd: string;
  chatTitle: string;
  projectTemplate: LoadedAgentProjectTemplate;
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

function writeRenderedTemplateIfMissing(path: string, templatePath: string, projectTemplate: LoadedAgentProjectTemplate): void {
  if (existsSync(path)) {
    return;
  }

  const content = renderTemplateText(
    readFileSync(templatePath, "utf8"),
    buildTemplateRenderVariables({
      projectTemplate
    })
  );

  writeFileSync(path, `${content.trimEnd()}\n`, "utf8");
}

function ensureAgentsDirectoryInstructions(cwd: string, projectTemplate: LoadedAgentProjectTemplate): void {
  writeRenderedTemplateIfMissing(resolve(cwd, "AGENTS.md"), getAgentsDirectoryTemplatePath(projectTemplate), projectTemplate);
}

function ensureRoleInstructions(
  cwd: string,
  roleName: string,
  projectTemplate: LoadedAgentProjectTemplate,
  roleTemplate?: AgentRoleTemplate,
  rolePurpose?: string
): void {
  const roleAgentsPath = resolve(cwd, "AGENTS.md");
  const legacyRoleOverridePath = resolve(cwd, "AGENTS.override.md");
  if (existsSync(roleAgentsPath) || existsSync(legacyRoleOverridePath)) {
    return;
  }

  if (roleTemplate) {
    writeRenderedTemplateIfMissing(
      roleAgentsPath,
      getRoleInstructionTemplatePath(projectTemplate, roleTemplate.directoryName),
      projectTemplate
    );
    return;
  }

  const customInstructionTemplate = readFileSync(getCustomRoleInstructionTemplatePath(projectTemplate), "utf8");
  const content = renderTemplateText(customInstructionTemplate, {
    ...buildTemplateRenderVariables({
      projectTemplate
    }),
    CUSTOM_ROLE_NAME: roleName,
    CUSTOM_ROLE_PURPOSE: rolePurpose?.trim() || "Role-specific operating notes for this directory."
  });

  writeFileSync(roleAgentsPath, `${content.trimEnd()}\n`, "utf8");
}
