import type {
  BootstrapPayload,
  ChatDetail,
  CodexExecutionProfile,
  CoordexProject,
  CoordexChat,
  CoordexProjectBoard,
  FeatureExecutionResponse,
  ProjectBundle
} from "../shared/types";

const jsonHeaders = {
  "Content-Type": "application/json"
};

async function unwrap<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error ?? `Request failed with status ${response.status}`);
  }

  return (await response.json()) as T;
}

export const api = {
  bootstrap(): Promise<BootstrapPayload> {
    return fetch("/api/bootstrap").then(unwrap);
  },
  createProject(input: { name: string; rootPath: string }): Promise<ProjectBundle> {
    return fetch("/api/projects", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    }).then(unwrap);
  },
  updateProject(projectId: string, input: { name: string; rootPath: string }): Promise<ProjectBundle> {
    return fetch(`/api/projects/${projectId}`, {
      method: "PATCH",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    }).then(unwrap);
  },
  updateExecutionProfile(
    projectId: string,
    input: { model: string; reasoningEffort: string }
  ): Promise<{ executionProfile: CodexExecutionProfile }> {
    return fetch(`/api/projects/${projectId}/execution-profile`, {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    }).then(unwrap);
  },
  deleteProject(projectId: string): Promise<void> {
    return fetch(`/api/projects/${projectId}`, {
      method: "DELETE"
    }).then(async (response) => {
      if (!response.ok) {
        await unwrap(response);
      }
    });
  },
  getProject(projectId: string): Promise<ProjectBundle> {
    return fetch(`/api/projects/${projectId}`).then(unwrap);
  },
  getProjectBoard(projectId: string): Promise<CoordexProjectBoard> {
    return fetch(`/api/projects/${projectId}/board`).then(unwrap);
  },
  saveProjectBoard(projectId: string, board: CoordexProjectBoard): Promise<CoordexProjectBoard> {
    return fetch(`/api/projects/${projectId}/board`, {
      method: "PUT",
      headers: jsonHeaders,
      body: JSON.stringify(board)
    }).then(unwrap);
  },
  archiveProjectBoard(projectId: string): Promise<CoordexProjectBoard> {
    return fetch(`/api/projects/${projectId}/board/archive`, {
      method: "POST",
      headers: jsonHeaders
    }).then(unwrap);
  },
  createChat(projectId: string, input: { title: string }): Promise<ChatDetail> {
    return fetch(`/api/projects/${projectId}/chats`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    }).then(unwrap);
  },
  createAgent(
    projectId: string,
    input: { projectTemplateKey?: string; templateKey?: string; roleName?: string; rolePurpose?: string }
  ): Promise<ChatDetail> {
    return fetch(`/api/projects/${projectId}/agents`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    }).then(unwrap);
  },
  getChat(chatId: string): Promise<ChatDetail> {
    return fetch(`/api/chats/${chatId}`).then(unwrap);
  },
  executeFeature(projectId: string, featureId: string): Promise<FeatureExecutionResponse> {
    return fetch(`/api/projects/${projectId}/features/${featureId}/execute`, {
      method: "POST",
      headers: jsonHeaders
    }).then(unwrap);
  },
  sendMessage(chatId: string, input: { text: string }): Promise<{ turnId: string }> {
    return fetch(`/api/chats/${chatId}/messages`, {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    }).then(unwrap);
  },
  compactChat(chatId: string): Promise<ChatDetail> {
    return fetch(`/api/chats/${chatId}/compact`, {
      method: "POST",
      headers: jsonHeaders
    }).then(unwrap);
  },
  setSelection(input: { projectId: string | null; chatId: string | null }): Promise<{ ok: boolean }> {
    return fetch("/api/selection", {
      method: "POST",
      headers: jsonHeaders,
      body: JSON.stringify(input)
    }).then(unwrap);
  },
  startChatgptLogin(): Promise<{ loginId: string; authUrl: string }> {
    return fetch("/api/auth/chatgpt/start", {
      method: "POST",
      headers: jsonHeaders
    }).then(unwrap);
  }
};

export type {
  BootstrapPayload,
  ChatDetail,
  CodexExecutionProfile,
  CoordexProject,
  CoordexChat,
  CoordexProjectBoard,
  FeatureExecutionResponse,
  ProjectBundle
};
