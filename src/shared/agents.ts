export const DEFAULT_AGENTS_DIRECTORY_NAME = "Agents";

export type AgentRoleTemplate = {
  key: string;
  label: string;
  directoryName: string;
  description: string;
  defaultChatTitle: string;
};

export type AgentProjectTemplate = {
  key: string;
  label: string;
  description: string;
  directoryName: string;
  roles: AgentRoleTemplate[];
};

export const AGENT_PROJECT_TEMPLATES: AgentProjectTemplate[] = [
  {
    key: "game-development",
    label: "Game development",
    description: "Default collaboration layout for a playable game project with supervisor-routed role chats.",
    directoryName: DEFAULT_AGENTS_DIRECTORY_NAME,
    roles: [
      {
        key: "supervisor",
        label: "supervisor",
        directoryName: "supervisor",
        description: "Project-wide coordinator. Owns routing, context, and cross-role decisions.",
        defaultChatTitle: "supervisor"
      },
      {
        key: "engineer",
        label: "engineer",
        directoryName: "engineer",
        description: "Merged implementation role for current-stage coding, runtime validation, and integration work.",
        defaultChatTitle: "engineer"
      },
      {
        key: "art_asset_producer",
        label: "art_asset_producer",
        directoryName: "art_asset_producer",
        description: "Visual direction, asset planning, SVG or image production, and acceptance preparation.",
        defaultChatTitle: "art_asset_producer"
      },
      {
        key: "qa_verifier",
        label: "qa_verifier",
        directoryName: "qa_verifier",
        description: "Verification, regression checks, acceptance flow review, and release confidence.",
        defaultChatTitle: "qa_verifier"
      }
    ]
  }
];

export function resolveAgentProjectTemplate(
  templateKey?: string
): AgentProjectTemplate {
  if (!AGENT_PROJECT_TEMPLATES.length) {
    throw new Error("No agent project templates are configured.");
  }

  if (!templateKey) {
    return AGENT_PROJECT_TEMPLATES[0];
  }

  const template = AGENT_PROJECT_TEMPLATES.find((candidate) => candidate.key === templateKey);
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
