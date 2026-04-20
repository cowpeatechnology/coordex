import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import {
  DEFAULT_AGENTS_DIRECTORY_NAME,
  type AgentProjectTemplate,
  type AgentRoleTemplate
} from "../shared/agents.js";

export type LoadedAgentProjectTemplate = AgentProjectTemplate & {
  templateRoot: string;
  customRoleInstructionTemplatePath: string;
  customRoleStateTemplatePath: string;
};

export type TemplateRenderVariables = Record<string, string>;

const serverDir = dirname(fileURLToPath(import.meta.url));
const templateRootCandidates = [resolve(serverDir, "../../templates"), resolve(serverDir, "../../../templates")];
const templatesRoot = templateRootCandidates.find((candidate) => existsSync(candidate)) ?? templateRootCandidates[0];
const DEFAULT_TEMPLATE_KEY = "game-development";

function expectRecord(value: unknown, field: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Template manifest field "${field}" must be an object.`);
  }

  return value as Record<string, unknown>;
}

function expectString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Template manifest field "${field}" must be a non-empty string.`);
  }

  return value.trim();
}

function expectStringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value)) {
    throw new Error(`Template manifest field "${field}" must be an array of strings.`);
  }

  return value.map((entry, index) => expectString(entry, `${field}[${index}]`));
}

function parseRoleTemplate(value: unknown, templateKey: string, index: number): AgentRoleTemplate {
  const source = expectRecord(value, `${templateKey}.roles[${index}]`);
  return {
    key: expectString(source.key, `${templateKey}.roles[${index}].key`),
    label: expectString(source.label, `${templateKey}.roles[${index}].label`),
    directoryName: expectString(source.directoryName, `${templateKey}.roles[${index}].directoryName`),
    description: expectString(source.description, `${templateKey}.roles[${index}].description`),
    defaultChatTitle: expectString(source.defaultChatTitle, `${templateKey}.roles[${index}].defaultChatTitle`),
    startupDocCandidates: expectStringArray(
      source.startupDocCandidates,
      `${templateKey}.roles[${index}].startupDocCandidates`
    )
  };
}

function loadTemplate(templateRoot: string): LoadedAgentProjectTemplate {
  const manifestPath = resolve(templateRoot, "manifest.json");
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing template manifest: ${manifestPath}`);
  }

  const rawManifest = JSON.parse(readFileSync(manifestPath, "utf8")) as unknown;
  const source = expectRecord(rawManifest, manifestPath);
  const templateKey = expectString(source.key, "key");

  return {
    key: templateKey,
    label: expectString(source.label, `${templateKey}.label`),
    description: expectString(source.description, `${templateKey}.description`),
    directoryName: expectString(source.directoryName, `${templateKey}.directoryName`),
    customRoleInstructionTemplatePath: expectString(
      source.customRoleInstructionTemplatePath,
      `${templateKey}.customRoleInstructionTemplatePath`
    ),
    customRoleStateTemplatePath: expectString(
      source.customRoleStateTemplatePath,
      `${templateKey}.customRoleStateTemplatePath`
    ),
    sharedStartupDocCandidates: expectStringArray(
      source.sharedStartupDocCandidates,
      `${templateKey}.sharedStartupDocCandidates`
    ),
    roles: Array.isArray(source.roles)
      ? source.roles.map((role, index) => parseRoleTemplate(role, templateKey, index))
      : (() => {
          throw new Error(`Template manifest field "${templateKey}.roles" must be an array.`);
        })(),
    templateRoot
  };
}

function loadAllTemplates(): LoadedAgentProjectTemplate[] {
  if (!existsSync(templatesRoot)) {
    throw new Error(`Template root does not exist: ${templatesRoot}`);
  }

  return readdirSync(templatesRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => loadTemplate(resolve(templatesRoot, entry.name)))
    .sort((left, right) => {
      if (left.key === DEFAULT_TEMPLATE_KEY && right.key !== DEFAULT_TEMPLATE_KEY) {
        return -1;
      }

      if (right.key === DEFAULT_TEMPLATE_KEY && left.key !== DEFAULT_TEMPLATE_KEY) {
        return 1;
      }

      return left.label.localeCompare(right.label);
    });
}

function stripLoadedTemplate(template: LoadedAgentProjectTemplate): AgentProjectTemplate {
  const {
    templateRoot: _templateRoot,
    customRoleInstructionTemplatePath: _customRoleInstructionTemplatePath,
    customRoleStateTemplatePath: _customRoleStateTemplatePath,
    ...sharedTemplate
  } = template;
  return sharedTemplate;
}

function ensureExistingPath(path: string, label: string): string {
  if (!existsSync(path)) {
    throw new Error(`Missing ${label}: ${path}`);
  }

  return path;
}

export function listAgentProjectTemplates(): AgentProjectTemplate[] {
  return loadAllTemplates().map(stripLoadedTemplate);
}

export function resolveAgentProjectTemplate(templateKey?: string): LoadedAgentProjectTemplate {
  const templates = loadAllTemplates();
  if (!templates.length) {
    throw new Error("No agent project templates are configured.");
  }

  if (!templateKey) {
    return templates.find((candidate) => candidate.key === DEFAULT_TEMPLATE_KEY) ?? templates[0];
  }

  const template = templates.find((candidate) => candidate.key === templateKey);
  if (!template) {
    throw new Error(`Unknown agent project template: ${templateKey}`);
  }

  return template;
}

export function resolveAgentRoleTemplate(
  projectTemplate: AgentProjectTemplate,
  roleTemplateKey?: string
): AgentRoleTemplate | undefined {
  if (!roleTemplateKey) {
    return undefined;
  }

  const template = projectTemplate.roles.find((candidate) => candidate.key === roleTemplateKey);
  if (!template) {
    throw new Error(`Unknown role template "${roleTemplateKey}" for project template "${projectTemplate.key}".`);
  }

  return template;
}

export function getProjectBootstrapTemplateDir(projectTemplate: LoadedAgentProjectTemplate): string {
  return ensureExistingPath(resolve(projectTemplate.templateRoot, "bootstrap"), "bootstrap template directory");
}

export function getProjectRootAgentsBaseTemplatePath(projectTemplate: LoadedAgentProjectTemplate): string {
  return ensureExistingPath(resolve(projectTemplate.templateRoot, "root-agents/AGENTS.base.md"), "root AGENTS base template");
}

export function getProjectRootAgentsWorkflowBlockTemplatePath(projectTemplate: LoadedAgentProjectTemplate): string {
  return ensureExistingPath(
    resolve(projectTemplate.templateRoot, "root-agents/coordex-workflow-block.md"),
    "root AGENTS workflow block template"
  );
}

export function getAgentsDirectoryTemplatePath(projectTemplate: LoadedAgentProjectTemplate): string {
  return ensureExistingPath(
    resolve(projectTemplate.templateRoot, `agent-files/${projectTemplate.directoryName}/AGENTS.md`),
    "agents directory template"
  );
}

export function getRoleInstructionTemplatePath(
  projectTemplate: LoadedAgentProjectTemplate,
  roleDirectoryName: string
): string {
  return ensureExistingPath(
    resolve(projectTemplate.templateRoot, `agent-files/${projectTemplate.directoryName}/${roleDirectoryName}/AGENTS.md`),
    `role instruction template for ${roleDirectoryName}`
  );
}

export function getCustomRoleInstructionTemplatePath(projectTemplate: LoadedAgentProjectTemplate): string {
  return ensureExistingPath(
    resolve(projectTemplate.templateRoot, projectTemplate.customRoleInstructionTemplatePath),
    `custom role instruction template for ${projectTemplate.key}`
  );
}

export function getCustomRoleStateTemplatePath(projectTemplate: LoadedAgentProjectTemplate): string {
  return ensureExistingPath(
    resolve(projectTemplate.templateRoot, projectTemplate.customRoleStateTemplatePath),
    `custom role-state template for ${projectTemplate.key}`
  );
}

export function buildTemplateRenderVariables(input: {
  projectName?: string;
  projectTemplate: AgentProjectTemplate;
}): TemplateRenderVariables {
  return {
    PROJECT_NAME: input.projectName?.trim() || "Replace with the real project name.",
    PROJECT_TEMPLATE_KEY: input.projectTemplate.key,
    PROJECT_TEMPLATE_LABEL: input.projectTemplate.label,
    AGENTS_DIRECTORY_NAME: input.projectTemplate.directoryName || DEFAULT_AGENTS_DIRECTORY_NAME,
    NOW_ISO: new Date().toISOString()
  };
}

export function renderTemplateText(content: string, variables: TemplateRenderVariables): string {
  return content.replace(/\{\{\s*([A-Z0-9_]+)\s*\}\}/g, (_match, token: string) => variables[token] ?? "");
}
