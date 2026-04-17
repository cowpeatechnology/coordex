export type AuthStatus = "authenticated" | "unauthenticated" | "unknown";
export type ChatSource = "coordex" | "imported";
export type CoordexChatKind = "chat" | "agent";

export type CoordexProject = {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
};

export type CoordexChat = {
  id: string;
  projectId: string;
  threadId: string;
  title: string;
  source: ChatSource;
  kind: CoordexChatKind;
  cwd: string;
  roleName: string | null;
  roleDirectory: string | null;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt: string;
};

export type CoordexState = {
  version: 2;
  projects: CoordexProject[];
  chats: CoordexChat[];
  selection: {
    projectId: string | null;
    chatId: string | null;
  };
};

export type AuthSummary = {
  status: AuthStatus;
  mode: "chatgpt" | "apiKey" | null;
  email: string | null;
  planType: string | null;
  requiresOpenaiAuth: boolean;
};

export type CodexThreadItem =
  | { type: "userMessage"; id: string; content: Array<{ type: string; text?: string; path?: string; url?: string }> }
  | { type: "agentMessage"; id: string; text: string; phase: string | null }
  | { type: "plan"; id: string; text: string }
  | { type: "reasoning"; id: string; summary: string[]; content: string[] }
  | {
      type: "commandExecution";
      id: string;
      command: string;
      cwd: string;
      status: string;
      aggregatedOutput: string | null;
      exitCode: number | null;
      durationMs: number | null;
    }
  | {
      type: "fileChange";
      id: string;
      changes: Array<{ path: string; kind?: string }>;
      status: string;
    }
  | {
      type: "mcpToolCall";
      id: string;
      server: string;
      tool: string;
      status: string;
      durationMs: number | null;
    }
  | { type: "webSearch"; id: string; query: string }
  | { type: string; id: string; [key: string]: unknown };

export type CodexTurn = {
  id: string;
  items: CodexThreadItem[];
  status: string;
  startedAt: number | null;
  completedAt: number | null;
  durationMs: number | null;
};

export type CodexThread = {
  id: string;
  name: string | null;
  preview: string;
  cwd: string;
  status: string;
  createdAt: number;
  updatedAt: number;
  turns: CodexTurn[];
};

export type ProjectBundle = {
  project: CoordexProject;
  chats: CoordexChat[];
};

export type ChatDetail = {
  project: CoordexProject;
  chat: CoordexChat;
  thread: CodexThread;
  liveState: {
    runningTurnId: string | null;
    draftAssistantText: string;
  };
};

export type BootstrapPayload = {
  auth: AuthSummary;
  projects: CoordexProject[];
  selection: {
    projectId: string | null;
    chatId: string | null;
  };
};

export type CoordexEvent =
  | { type: "auth.summary"; payload: AuthSummary }
  | { type: "state.selection"; payload: { projectId: string | null; chatId: string | null } }
  | { type: "codex.notification"; payload: { method: string; params: Record<string, unknown> } };
