export const DEFAULT_AGENTS_DIRECTORY_NAME = "Agents";

export type AgentRoleTemplate = {
  key: string;
  label: string;
  directoryName: string;
  description: string;
  defaultChatTitle: string;
  startupDocCandidates: string[];
};

export type AgentProjectTemplate = {
  key: string;
  label: string;
  description: string;
  directoryName: string;
  sharedStartupDocCandidates: string[];
  roles: AgentRoleTemplate[];
};
