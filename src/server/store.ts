import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";

import type { CoordexChat, CoordexProject, CoordexState } from "../shared/types.js";

type DiscoveredThread = {
  threadId: string;
  title: string;
  cwd: string;
  updatedAt: number;
};

const STATE_VERSION = 3;

const defaultState = (): CoordexState => ({
  version: STATE_VERSION,
  projects: [],
  chats: [],
  selection: {
    projectId: null,
    chatId: null
  }
});

const isoNow = (): string => new Date().toISOString();

const belongsToProjectRoot = (cwd: string, projectRoot: string): boolean => {
  const normalizedCwd = resolve(cwd).replace(/\\/g, "/");
  const normalizedProjectRoot = resolve(projectRoot).replace(/\\/g, "/");
  return normalizedCwd === normalizedProjectRoot || normalizedCwd.startsWith(`${normalizedProjectRoot}/`);
};

type LegacyState = {
  version?: number;
  projects?: Array<Partial<CoordexProject>>;
  chats?: Array<
    Partial<CoordexChat> & {
      projectId?: string;
    }
  >;
  selection?: {
    projectId?: string | null;
    chatId?: string | null;
  };
};

export class StateStore {
  private readonly statePath: string;
  private state: CoordexState;

  constructor(statePath = resolve(process.env.COORDEX_HOME ?? homedir(), ".coordex", "state.json")) {
    this.statePath = statePath;
    this.state = this.load();
  }

  getSnapshot(): CoordexState {
    return JSON.parse(JSON.stringify(this.state)) as CoordexState;
  }

  listProjects(): CoordexProject[] {
    return [...this.state.projects].sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
  }

  getProject(projectId: string): CoordexProject | undefined {
    return this.state.projects.find((project) => project.id === projectId);
  }

  getChat(chatId: string): CoordexChat | undefined {
    return this.state.chats.find((chat) => chat.id === chatId);
  }

  getChatByThreadId(threadId: string): CoordexChat | undefined {
    return this.state.chats.find((chat) => chat.threadId === threadId);
  }

  getChatsForProject(projectId: string): CoordexChat[] {
    return this.state.chats
      .filter((chat) => chat.projectId === projectId)
      .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt));
  }

  createProject(name: string, rootPath: string): CoordexProject {
    const normalizedPath = resolve(rootPath);
    const stat = statSync(normalizedPath, { throwIfNoEntry: false });
    if (!stat || !stat.isDirectory()) {
      throw new Error(`Project root does not exist or is not a directory: ${normalizedPath}`);
    }

    const duplicate = this.state.projects.find((project) => project.rootPath === normalizedPath);
    if (duplicate) {
      throw new Error(`Project root is already registered: ${normalizedPath}`);
    }

    const now = isoNow();
    const project: CoordexProject = {
      id: randomUUID(),
      name: name.trim(),
      rootPath: normalizedPath,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now
    };

    this.state.projects.push(project);
    this.state.selection.projectId = project.id;
    this.state.selection.chatId = null;
    this.persist();
    return project;
  }

  syncChatsForProject(projectId: string, discoveredThreads: DiscoveredThread[]): CoordexChat[] {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }

    const now = isoNow();
    const discoveredThreadIds = new Set(discoveredThreads.map((thread) => thread.threadId));
    const removedChatIds = new Set<string>();
    this.state.chats = this.state.chats.filter((chat) => {
      if (chat.projectId !== projectId) {
        return true;
      }

      const stillBelongsToProject = belongsToProjectRoot(chat.cwd, project.rootPath);
      const keepBecausePending = chat.launchState === "pending";
      const keepBecauseDiscovered = discoveredThreadIds.has(chat.threadId);
      const keep = stillBelongsToProject && (keepBecausePending || keepBecauseDiscovered);
      if (!keep) {
        removedChatIds.add(chat.id);
      }
      return keep;
    });

    if (this.state.selection.chatId && removedChatIds.has(this.state.selection.chatId)) {
      this.state.selection.chatId = null;
    }

    const byThreadId = new Map(
      this.state.chats
        .filter((chat) => chat.projectId === projectId)
        .map((chat) => [chat.threadId, chat])
    );

    for (const thread of discoveredThreads) {
      const existing = byThreadId.get(thread.threadId);
      const nextTitle = thread.title.trim() || "Untitled chat";

      if (existing) {
        if (existing.projectId !== projectId) {
          continue;
        }

        existing.updatedAt = now;
        existing.cwd = thread.cwd;
        existing.launchState = "active";
        if (existing.source === "imported") {
          existing.title = nextTitle;
        }
        continue;
      }

      this.state.chats.push({
        id: randomUUID(),
        projectId,
        threadId: thread.threadId,
        title: nextTitle,
        source: "imported",
        kind: "chat",
        launchState: "active",
        cwd: thread.cwd,
        roleName: null,
        roleDirectory: null,
        createdAt: now,
        updatedAt: now,
        lastOpenedAt: now
      });
    }

    project.updatedAt = now;
    this.persist();
    return this.getChatsForProject(projectId);
  }

  updateProject(
    projectId: string,
    input: {
      name: string;
      rootPath: string;
    }
  ): CoordexProject {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }

    const name = input.name.trim();
    const normalizedPath = resolve(input.rootPath);
    if (!name || !normalizedPath) {
      throw new Error("Both name and rootPath are required.");
    }

    const stat = statSync(normalizedPath, { throwIfNoEntry: false });
    if (!stat || !stat.isDirectory()) {
      throw new Error(`Project root does not exist or is not a directory: ${normalizedPath}`);
    }

    const duplicate = this.state.projects.find((entry) => entry.id !== projectId && entry.rootPath === normalizedPath);
    if (duplicate) {
      throw new Error(`Project root is already registered: ${normalizedPath}`);
    }

    const now = isoNow();
    project.name = name;
    project.rootPath = normalizedPath;
    project.updatedAt = now;

    const removedChatIds = new Set(
      this.state.chats
        .filter((chat) => chat.projectId === projectId && !belongsToProjectRoot(chat.cwd, normalizedPath))
        .map((chat) => chat.id)
    );

    if (removedChatIds.size > 0) {
      this.state.chats = this.state.chats.filter((chat) => !removedChatIds.has(chat.id));
      if (this.state.selection.chatId && removedChatIds.has(this.state.selection.chatId)) {
        this.state.selection.chatId = null;
      }
    }

    this.persist();
    return project;
  }

  deleteProject(projectId: string): void {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }

    const removedChatIds = new Set(
      this.state.chats.filter((chat) => chat.projectId === projectId).map((chat) => chat.id)
    );

    this.state.projects = this.state.projects.filter((entry) => entry.id !== projectId);
    this.state.chats = this.state.chats.filter((chat) => chat.projectId !== projectId);

    if (this.state.selection.projectId === projectId) {
      this.state.selection.projectId = null;
    }

    if (this.state.selection.chatId && removedChatIds.has(this.state.selection.chatId)) {
      this.state.selection.chatId = null;
    }

    this.persist();
  }

  registerChat(
    projectId: string,
    chatInput: {
      threadId: string;
      title: string;
      source: CoordexChat["source"];
      kind: CoordexChat["kind"];
      launchState: CoordexChat["launchState"];
      cwd: string;
      roleName: string | null;
      roleDirectory: string | null;
    }
  ): CoordexChat {
    const project = this.getProject(projectId);
    if (!project) {
      throw new Error(`Unknown project: ${projectId}`);
    }

    const now = isoNow();
    const existing = this.state.chats.find(
      (chat) => chat.threadId === chatInput.threadId && chat.projectId === projectId
    );
    if (existing) {
      existing.title = chatInput.title.trim() || existing.title;
      existing.source = chatInput.source;
      existing.kind = chatInput.kind;
      existing.launchState = chatInput.launchState;
      existing.cwd = resolve(chatInput.cwd);
      existing.roleName = chatInput.roleName;
      existing.roleDirectory = chatInput.roleDirectory;
      existing.updatedAt = now;
      existing.lastOpenedAt = now;
      this.state.selection.projectId = projectId;
      this.state.selection.chatId = existing.id;
      this.persist();
      return existing;
    }

    const chat: CoordexChat = {
      id: randomUUID(),
      projectId,
      threadId: chatInput.threadId,
      title: chatInput.title.trim() || "Untitled chat",
      source: chatInput.source,
      kind: chatInput.kind,
      launchState: chatInput.launchState,
      cwd: resolve(chatInput.cwd),
      roleName: chatInput.roleName,
      roleDirectory: chatInput.roleDirectory,
      createdAt: now,
      updatedAt: now,
      lastOpenedAt: now
    };

    this.state.chats.push(chat);
    this.state.selection.projectId = projectId;
    this.state.selection.chatId = chat.id;
    this.persist();
    return chat;
  }

  updateChatLaunchState(chatId: string, launchState: CoordexChat["launchState"]): CoordexChat | undefined {
    const chat = this.getChat(chatId);
    if (!chat || chat.launchState === launchState) {
      return chat;
    }

    chat.launchState = launchState;
    chat.updatedAt = isoNow();
    this.persist();
    return chat;
  }

  setSelection(projectId: string | null, chatId: string | null): void {
    const now = isoNow();

    this.state.selection.projectId = projectId;
    this.state.selection.chatId = chatId;

    if (projectId) {
      const project = this.getProject(projectId);
      if (project) {
        project.lastOpenedAt = now;
        project.updatedAt = now;
      }
    }

    if (chatId) {
      const chat = this.getChat(chatId);
      if (chat) {
        chat.lastOpenedAt = now;
        chat.updatedAt = now;
      }
    }

    this.persist();
  }

  private load(): CoordexState {
    try {
      if (!existsSync(this.statePath)) {
        return defaultState();
      }

      const raw = readFileSync(this.statePath, "utf8");
      return this.migrate(JSON.parse(raw) as LegacyState);
    } catch {
      return defaultState();
    }
  }

  private migrate(input: LegacyState): CoordexState {
    const projects = Array.isArray(input.projects)
      ? input.projects
          .filter((project): project is Partial<CoordexProject> & { id: string; name: string; rootPath: string } => {
            return typeof project?.id === "string" && typeof project?.name === "string" && typeof project?.rootPath === "string";
          })
          .map((project) => ({
            id: project.id,
            name: project.name.trim(),
            rootPath: resolve(project.rootPath),
            createdAt: typeof project.createdAt === "string" ? project.createdAt : isoNow(),
            updatedAt: typeof project.updatedAt === "string" ? project.updatedAt : isoNow(),
            lastOpenedAt: typeof project.lastOpenedAt === "string" ? project.lastOpenedAt : isoNow()
          }))
      : [];

    const projectRootById = new Map(projects.map((project) => [project.id, project.rootPath]));

    const chats = Array.isArray(input.chats)
      ? input.chats
          .filter((chat): chat is NonNullable<LegacyState["chats"]>[number] & { id: string; projectId: string; threadId: string } => {
            return (
              typeof chat?.id === "string" &&
              typeof chat?.projectId === "string" &&
              typeof chat?.threadId === "string" &&
              projectRootById.has(chat.projectId)
            );
          })
          .map((chat) => {
            const fallbackRoot = projectRootById.get(chat.projectId) ?? "";
            const cwd = typeof chat.cwd === "string" && chat.cwd.trim() ? resolve(chat.cwd) : fallbackRoot;

            return {
              id: chat.id,
              projectId: chat.projectId,
              threadId: chat.threadId,
              title: typeof chat.title === "string" && chat.title.trim() ? chat.title.trim() : "Untitled chat",
              source: chat.source === "imported" ? "imported" : "coordex",
              kind: chat.kind === "agent" ? "agent" : "chat",
              launchState:
                chat.launchState === "active"
                  ? "active"
                  : chat.kind === "agent"
                    ? "pending"
                    : "active",
              cwd,
              roleName: typeof chat.roleName === "string" && chat.roleName.trim() ? chat.roleName.trim() : null,
              roleDirectory:
                typeof chat.roleDirectory === "string" && chat.roleDirectory.trim() ? chat.roleDirectory.trim() : null,
              createdAt: typeof chat.createdAt === "string" ? chat.createdAt : isoNow(),
              updatedAt: typeof chat.updatedAt === "string" ? chat.updatedAt : isoNow(),
              lastOpenedAt: typeof chat.lastOpenedAt === "string" ? chat.lastOpenedAt : isoNow()
            } satisfies CoordexChat;
          })
      : [];

    const rawSelectionProjectId = typeof input.selection?.projectId === "string" ? input.selection.projectId : null;
    const rawSelectionChatId = typeof input.selection?.chatId === "string" ? input.selection.chatId : null;

    const selectionProjectId =
      rawSelectionProjectId && projectRootById.has(rawSelectionProjectId)
        ? rawSelectionProjectId
        : null;
    const selectionChat =
      rawSelectionChatId ? chats.find((chat) => chat.id === rawSelectionChatId) : undefined;

    return {
      version: STATE_VERSION,
      projects,
      chats,
      selection: {
        projectId: selectionProjectId,
        chatId: selectionChat && selectionChat.projectId === selectionProjectId ? selectionChat.id : null
      }
    };
  }

  private persist(): void {
    mkdirSync(dirname(this.statePath), { recursive: true });
    writeFileSync(this.statePath, JSON.stringify(this.state, null, 2), "utf8");
  }
}
