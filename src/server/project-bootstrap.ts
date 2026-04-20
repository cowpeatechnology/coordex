import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";

import {
  buildTemplateRenderVariables,
  getCustomRoleStateTemplatePath,
  getProjectBootstrapTemplateDir,
  getProjectRootAgentsBaseTemplatePath,
  getProjectRootAgentsWorkflowBlockTemplatePath,
  renderTemplateText,
  resolveAgentProjectTemplate,
  type LoadedAgentProjectTemplate,
  type TemplateRenderVariables
} from "./template-loader.js";

type RoleStateSeed = {
  key: string;
  label: string;
  purpose: string;
};

type ProjectBootstrapOptions = {
  projectName?: string;
  projectTemplate?: LoadedAgentProjectTemplate;
  extraRoleStateSeeds?: RoleStateSeed[];
};

const ROOT_WORKFLOW_BLOCK_START = "<!-- COORDEX:PROJECT-WORKFLOW:START -->";
const ROOT_WORKFLOW_BLOCK_END = "<!-- COORDEX:PROJECT-WORKFLOW:END -->";

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

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const renderFileTemplate = (templatePath: string, variables: TemplateRenderVariables): string => {
  return renderTemplateText(readFileSync(templatePath, "utf8"), variables);
};

const copyTemplateTreeIfMissing = (sourceRoot: string, destinationRoot: string, variables: TemplateRenderVariables): void => {
  const entries = readdirSync(sourceRoot, { withFileTypes: true });

  for (const entry of entries) {
    const sourcePath = resolve(sourceRoot, entry.name);
    const destinationPath = resolve(destinationRoot, relative(sourceRoot, sourcePath));

    if (entry.isDirectory()) {
      copyTemplateTreeIfMissing(sourcePath, destinationPath, variables);
      continue;
    }

    if (!entry.isFile() || existsSync(destinationPath)) {
      continue;
    }

    ensureParentDir(destinationPath);
    writeFileSync(destinationPath, `${renderFileTemplate(sourcePath, variables).trimEnd()}\n`, "utf8");
  }
};

const syncRootWorkflowBlock = (
  agentsPath: string,
  projectTemplate: LoadedAgentProjectTemplate,
  variables: TemplateRenderVariables
): void => {
  const blockContent = renderFileTemplate(getProjectRootAgentsWorkflowBlockTemplatePath(projectTemplate), variables).trimEnd();
  const currentContent = readFileSync(agentsPath, "utf8");
  const blockHeading = blockContent.split(/\r?\n/, 1)[0] ?? "## Coordex Workflow";
  const fullBlockPattern = new RegExp(
    `${escapeRegex(blockHeading)}[\\s\\S]*?${escapeRegex(ROOT_WORKFLOW_BLOCK_END)}\\n?`,
    "m"
  );
  const blockPattern = new RegExp(
    `${escapeRegex(ROOT_WORKFLOW_BLOCK_START)}[\\s\\S]*?${escapeRegex(ROOT_WORKFLOW_BLOCK_END)}\\n?`,
    "m"
  );

  const nextContent = fullBlockPattern.test(currentContent)
    ? currentContent.replace(fullBlockPattern, blockContent)
    : blockPattern.test(currentContent)
      ? currentContent.replace(blockPattern, blockContent)
    : `${currentContent.trimEnd()}${currentContent.trim().length ? "\n\n" : ""}${blockContent}\n`;

  if (nextContent !== currentContent) {
    writeFileSync(agentsPath, nextContent.endsWith("\n") ? nextContent : `${nextContent}\n`, "utf8");
  }
};

const ensureRootAgentsFile = (
  projectRoot: string,
  projectTemplate: LoadedAgentProjectTemplate,
  variables: TemplateRenderVariables
): void => {
  const agentsPath = resolve(projectRoot, "AGENTS.md");
  if (!existsSync(agentsPath)) {
    writeIfMissing(agentsPath, renderFileTemplate(getProjectRootAgentsBaseTemplatePath(projectTemplate), variables));
  }

  syncRootWorkflowBlock(agentsPath, projectTemplate, variables);
};

export function ensureProjectInitializationPackage(projectRoot: string, options: ProjectBootstrapOptions = {}): void {
  const projectTemplate = options.projectTemplate ?? resolveAgentProjectTemplate();
  const variables = buildTemplateRenderVariables({
    projectName: options.projectName,
    projectTemplate
  });

  copyTemplateTreeIfMissing(getProjectBootstrapTemplateDir(projectTemplate), projectRoot, variables);
  ensureRootAgentsFile(projectRoot, projectTemplate, variables);

  for (const seed of options.extraRoleStateSeeds ?? []) {
    const roleStatePath = resolve(projectRoot, `docs/project/role-state/${seed.key}.md`);
    if (existsSync(roleStatePath)) {
      continue;
    }

    const customRoleState = renderTemplateText(readFileSync(getCustomRoleStateTemplatePath(projectTemplate), "utf8"), {
      ...variables,
      CUSTOM_ROLE_KEY: seed.key,
      CUSTOM_ROLE_LABEL: seed.label,
      CUSTOM_ROLE_PURPOSE: seed.purpose
    });
    writeIfMissing(roleStatePath, customRoleState);
  }
}
