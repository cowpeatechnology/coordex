import cors from "cors";
import express from "express";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { buildFeatureDispatchMessage } from "../shared/coordination.js";
import type {
  AuthSummary,
  BootstrapPayload,
  ChatDetail,
  CoordexEvent,
  CoordexProjectBoard,
  FeatureExecutionResponse,
  ProjectBundle
} from "../shared/types.js";
import { cleanupAgentWorkspace, resolveAgentWorkspace } from "./agent-workspace.js";
import {
  assertReadySignal,
  assertRootChatReadySignal,
  buildAgentInitializationPrompt,
  buildRootChatInitializationPrompt,
  extractAssistantTextForTurn,
  resolveAgentInitializationDocs
} from "./agent-initialization.js";
import { CodexAppServerClient } from "./codex-app-server.js";
import { AutoCoordinationRuntime } from "./coordination-runtime.js";
import { syncProjectAgentRegistry } from "./project-agent-doc.js";
import { archiveProjectBoardPlan, loadProjectBoard, saveProjectBoard } from "./project-board.js";
import { ensureProjectInitializationPackage } from "./project-bootstrap.js";
import { readCodexExecutionProfileForProject } from "./project-codex-profile.js";
import { StateStore } from "./store.js";
import { listAgentProjectTemplates } from "./template-loader.js";

const PORT = Number(process.env.COORDEX_PORT ?? 4318);
const app = express();
const store = new StateStore();
const codex = new CodexAppServerClient();
const sseClients = new Set<express.Response>();

app.use(cors());
app.use(express.json({ limit: "1mb" }));

const serverDir = dirname(fileURLToPath(import.meta.url));
const clientDistDir = resolve(serverDir, "../../client");

const sendEvent = (event: CoordexEvent): void => {
  const body = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    client.write(body);
  }
};

const sendBoardEvent = (projectId: string, board: CoordexProjectBoard): void => {
  sendEvent({
    type: "project.board",
    payload: {
      projectId,
      board
    }
  });
};

const normalizeRoleName = (value: string | null | undefined): string => (value ?? "").trim().toLowerCase();

const getProjectBundle = async (projectId: string): Promise<ProjectBundle> => {
  const project = store.getProject(projectId);
  if (!project) {
    throw new Error(`Unknown project: ${projectId}`);
  }

  const threads = await codex.listThreadsForProject(project.rootPath);
  const chats = store.syncChatsForProject(
    projectId,
    threads.map((thread) => ({
      threadId: thread.id,
      title: thread.name ?? thread.preview ?? "Untitled chat",
      cwd: thread.cwd,
      updatedAt: thread.updatedAt
    }))
  );

  return {
    project,
    chats
  };
};

const getChatDetail = async (chatId: string): Promise<ChatDetail> => {
  const chat = store.getChat(chatId);
  if (!chat) {
    throw new Error(`Unknown chat: ${chatId}`);
  }

  const project = store.getProject(chat.projectId);
  if (!project) {
    throw new Error(`Unknown project for chat: ${chatId}`);
  }

  const thread = await codex.readThread(chat.threadId);
  const launchState = thread.turns.length > 0 || chat.kind === "chat" ? "active" : "pending";
  const nextChat = store.updateChatLaunchState(chat.id, launchState) ?? chat;

  return {
    project,
    chat: nextChat,
    thread,
    executionProfile: readCodexExecutionProfileForProject(project.rootPath),
    liveState: codex.getReconciledLiveState(thread)
  };
};

const getProjectBoard = (projectId: string): CoordexProjectBoard => {
  const project = store.getProject(projectId);
  if (!project) {
    throw new Error(`Unknown project: ${projectId}`);
  }

  return loadProjectBoard(project.rootPath);
};

const readAuth = async (): Promise<AuthSummary> => {
  try {
    return await codex.getAuthSummary();
  } catch {
    return {
      status: "unknown",
      mode: null,
      email: null,
      planType: null,
      requiresOpenaiAuth: true
    };
  }
};

const autoCoordination = new AutoCoordinationRuntime({
  store,
  codex,
  onBoardChanged: sendBoardEvent,
  onSelectionChanged: (projectId, chatId) => {
    store.setSelection(projectId, chatId);
    sendEvent({
      type: "state.selection",
      payload: {
        projectId,
        chatId
      }
    });
  }
});

codex.on("notification", async (notification: { method: string; params?: Record<string, unknown> }) => {
  sendEvent({
    type: "codex.notification",
    payload: {
      method: notification.method,
      params: notification.params ?? {}
    }
  });

  if (notification.method === "account/updated" || notification.method === "account/login/completed") {
    sendEvent({
      type: "auth.summary",
      payload: await readAuth()
    });
  }

  void autoCoordination.handleNotification(notification).catch((error) => {
    sendEvent({
      type: "codex.notification",
      payload: {
        method: "coordex/auto-coordination/error",
        params: {
          error: error instanceof Error ? error.message : String(error)
        }
      }
    });
  });
});

app.get("/api/bootstrap", async (_req, res) => {
  const snapshot = store.getSnapshot();
  const payload: BootstrapPayload = {
    auth: await readAuth(),
    templates: listAgentProjectTemplates(),
    projects: store.listProjects(),
    selection: snapshot.selection
  };

  res.json(payload);
});

app.post("/api/selection", async (req, res) => {
  const projectId = typeof req.body?.projectId === "string" ? req.body.projectId : null;
  const chatId = typeof req.body?.chatId === "string" ? req.body.chatId : null;

  store.setSelection(projectId, chatId);
  sendEvent({
    type: "state.selection",
    payload: {
      projectId,
      chatId
    }
  });

  res.json({
    ok: true
  });
});

app.post("/api/auth/chatgpt/start", async (_req, res) => {
  try {
    const login = await codex.startChatgptLogin();
    res.json(login);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/projects", async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const rootPath = typeof req.body?.rootPath === "string" ? req.body.rootPath.trim() : "";

    if (!name || !rootPath) {
      res.status(400).json({
        error: "Both name and rootPath are required."
      });
      return;
    }

    const project = store.createProject(name, rootPath);
    ensureProjectInitializationPackage(project.rootPath, {
      projectName: project.name
    });
    syncProjectAgentRegistry(project.rootPath, store.getChatsForProject(project.id));
    loadProjectBoard(project.rootPath);
    const bundle = await getProjectBundle(project.id);
    res.status(201).json(bundle);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.patch("/api/projects/:projectId", async (req, res) => {
  try {
    const name = typeof req.body?.name === "string" ? req.body.name.trim() : "";
    const rootPath = typeof req.body?.rootPath === "string" ? req.body.rootPath.trim() : "";

    if (!name || !rootPath) {
      res.status(400).json({
        error: "Both name and rootPath are required."
      });
      return;
    }

    const project = store.updateProject(req.params.projectId, {
      name,
      rootPath
    });
    ensureProjectInitializationPackage(project.rootPath, {
      projectName: project.name
    });
    syncProjectAgentRegistry(project.rootPath, store.getChatsForProject(project.id));
    loadProjectBoard(project.rootPath);
    const bundle = await getProjectBundle(project.id);
    sendEvent({
      type: "state.selection",
      payload: store.getSnapshot().selection
    });
    res.json(bundle);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/projects/:projectId", async (req, res) => {
  try {
    const bundle = await getProjectBundle(req.params.projectId);
    res.json(bundle);
  } catch (error) {
    res.status(404).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/projects/:projectId/board", async (req, res) => {
  try {
    res.json(getProjectBoard(req.params.projectId));
  } catch (error) {
    res.status(404).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.put("/api/projects/:projectId/board", async (req, res) => {
  try {
    const project = store.getProject(req.params.projectId);
    if (!project) {
      res.status(404).json({ error: "Unknown project." });
      return;
    }

    const board = saveProjectBoard(project.rootPath, req.body as CoordexProjectBoard);
    res.json(board);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/projects/:projectId/board/archive", async (req, res) => {
  try {
    const project = store.getProject(req.params.projectId);
    if (!project) {
      res.status(404).json({ error: "Unknown project." });
      return;
    }

    const board = archiveProjectBoardPlan(project.rootPath);
    res.json(board);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/projects/:projectId/features/:featureId/execute", async (req, res) => {
  try {
    const project = store.getProject(req.params.projectId);
    if (!project) {
      res.status(404).json({ error: "Unknown project." });
      return;
    }

    const board = loadProjectBoard(project.rootPath);
    const feature = board.activePlan.features.find((entry) => entry.id === req.params.featureId);
    if (!feature) {
      res.status(404).json({ error: `Unknown active subfunction "${req.params.featureId}".` });
      return;
    }

    if (feature.done) {
      res.status(400).json({ error: "This subfunction is already completed." });
      return;
    }

    if (feature.runState === "running") {
      res.status(400).json({ error: "This subfunction is already running." });
      return;
    }

    const ownerRole = feature.ownerRole.trim();
    if (!ownerRole) {
      res.status(400).json({ error: "Assign one implementation role before executing this subfunction." });
      return;
    }

    const targetChat =
      store
        .getChatsForProject(project.id)
        .find((chat) => chat.kind === "agent" && normalizeRoleName(chat.roleName) === normalizeRoleName(ownerRole)) ?? null;
    if (!targetChat) {
      res.status(400).json({ error: `No active agent thread exists for role "${ownerRole}".` });
      return;
    }

    const turn = await codex.sendMessage(
      targetChat.threadId,
      targetChat.cwd,
      buildFeatureDispatchMessage(project, board.activePlan, feature)
    );

    feature.runState = "running";
    feature.coordinations.push({
      id: randomUUID(),
      fromRole: "human",
      toRole: ownerRole,
      kind: "dispatch",
      summary: feature.title || feature.id,
      input: feature.description || "Implement the assigned subfunction within its current scope.",
      expectedOutput: "A structured coordination response that keeps the subfunction moving until completion or failure.",
      output: "",
      status: "open",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });

    const nextBoard = saveProjectBoard(project.rootPath, board);
    sendBoardEvent(project.id, nextBoard);

    const payload: FeatureExecutionResponse = {
      board: nextBoard,
      chat: targetChat,
      turnId: turn.turnId
    };
    res.status(202).json(payload);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.delete("/api/projects/:projectId", async (req, res) => {
  try {
    store.deleteProject(req.params.projectId);
    sendEvent({
      type: "state.selection",
      payload: store.getSnapshot().selection
    });
    res.status(204).end();
  } catch (error) {
    res.status(404).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/projects/:projectId/chats", async (req, res) => {
  let createdThreadId: string | null = null;

  try {
    const project = store.getProject(req.params.projectId);
    if (!project) {
      res.status(404).json({ error: "Unknown project." });
      return;
    }

    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const chatTitle = title || "New chat";
    const thread = await codex.createThread(project.rootPath, chatTitle);
    createdThreadId = thread.threadId;
    const initializationPrompt = buildRootChatInitializationPrompt({
      projectName: project.name,
      chatTitle
    });
    const turn = await codex.sendMessage(thread.threadId, project.rootPath, initializationPrompt);
    const initializedThread = await codex.waitForTurnCompletion(thread.threadId, turn.turnId);
    const assistantText = extractAssistantTextForTurn(initializedThread, turn.turnId);
    assertRootChatReadySignal(assistantText);

    const chat = store.registerChat(project.id, {
      threadId: thread.threadId,
      title: chatTitle,
      source: "coordex",
      kind: "chat",
      launchState: "active",
      cwd: project.rootPath,
      roleName: null,
      roleDirectory: null
    });
    const detail = await getChatDetail(chat.id);
    res.status(201).json(detail);
  } catch (error) {
    if (createdThreadId) {
      try {
        await codex.archiveThread(createdThreadId);
      } catch {
        // Preserve the original root-chat initialization error for the response.
      }
    }
    res.status(400).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/projects/:projectId/agents", async (req, res) => {
  let createdThreadId: string | null = null;
  let workspace: ReturnType<typeof resolveAgentWorkspace> | null = null;

  try {
    const project = store.getProject(req.params.projectId);
    if (!project) {
      res.status(404).json({ error: "Unknown project." });
      return;
    }

    workspace = resolveAgentWorkspace(project.rootPath, {
      projectTemplateKey: typeof req.body?.projectTemplateKey === "string" ? req.body.projectTemplateKey : undefined,
      templateKey: typeof req.body?.templateKey === "string" ? req.body.templateKey : undefined,
      roleName: typeof req.body?.roleName === "string" ? req.body.roleName : undefined,
      rolePurpose: typeof req.body?.rolePurpose === "string" ? req.body.rolePurpose : undefined
    });
    ensureProjectInitializationPackage(project.rootPath, {
      projectName: project.name,
      projectTemplate: workspace.projectTemplate,
      extraRoleStateSeeds: workspace.roleTemplate
        ? []
        : [
            {
              key: workspace.roleDirectory.split("/").at(-1) || workspace.roleName,
              label: workspace.roleName,
              purpose:
                (typeof req.body?.rolePurpose === "string" && req.body.rolePurpose.trim()) ||
                "Role-specific operating notes for this directory."
            }
          ]
    });

    const thread = await codex.createThread(workspace.cwd, workspace.chatTitle);
    createdThreadId = thread.threadId;
    const startupDocs = resolveAgentInitializationDocs({
      projectRoot: project.rootPath,
      projectTemplate: workspace.projectTemplate,
      roleTemplate: workspace.roleTemplate,
      roleStateKey: workspace.roleDirectory.split("/").at(-1)
    });
    const rolePurpose =
      typeof req.body?.rolePurpose === "string" && req.body.rolePurpose.trim()
        ? req.body.rolePurpose.trim()
        : workspace.roleTemplate?.description;
    const initializationPrompt = buildAgentInitializationPrompt({
      projectName: project.name,
      projectRoot: project.rootPath,
      roleName: workspace.roleName,
      rolePurpose,
      startupDocs
    });
    const turn = await codex.sendMessage(thread.threadId, workspace.cwd, initializationPrompt);
    const initializedThread = await codex.waitForTurnCompletion(thread.threadId, turn.turnId);
    const assistantText = extractAssistantTextForTurn(initializedThread, turn.turnId);
    assertReadySignal(assistantText);

    const chat = store.registerChat(project.id, {
      threadId: thread.threadId,
      title: workspace.chatTitle,
      source: "coordex",
      kind: "agent",
      launchState: "active",
      cwd: workspace.cwd,
      roleName: workspace.roleName,
      roleDirectory: workspace.roleDirectory
    });
    syncProjectAgentRegistry(project.rootPath, store.getChatsForProject(project.id));
    const detail = await getChatDetail(chat.id);
    res.status(201).json(detail);
  } catch (error) {
    const project = store.getProject(req.params.projectId);
    if (createdThreadId) {
      try {
        await codex.archiveThread(createdThreadId);
      } catch {
        // Preserve the original initialization error for the response.
      }
    }
    if (project && workspace) {
      cleanupAgentWorkspace(project.rootPath, workspace.roleDirectory);
      syncProjectAgentRegistry(project.rootPath, store.getChatsForProject(project.id));
    }
    res.status(400).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/api/chats/:chatId", async (req, res) => {
  try {
    const detail = await getChatDetail(req.params.chatId);
    res.json(detail);
  } catch (error) {
    res.status(404).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/chats/:chatId/archive", async (req, res) => {
  try {
    const chat = store.getChat(req.params.chatId);
    if (!chat) {
      res.status(404).json({ error: "Unknown chat." });
      return;
    }

    const project = store.getProject(chat.projectId);
    if (!project) {
      res.status(404).json({ error: "Unknown project." });
      return;
    }

    try {
      await codex.archiveThread(chat.threadId);
    } catch {
      // Allow local archive cleanup to proceed even if the thread was already archived.
    }

    const removedChat = store.removeChat(chat.id);
    if (removedChat?.kind === "agent") {
      syncProjectAgentRegistry(project.rootPath, store.getChatsForProject(project.id));
    }

    sendEvent({
      type: "state.selection",
      payload: store.getSnapshot().selection
    });

    const bundle = await getProjectBundle(project.id);
    res.json(bundle);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/chats/:chatId/compact", async (req, res) => {
  try {
    const chat = store.getChat(req.params.chatId);
    if (!chat) {
      res.status(404).json({ error: "Unknown chat." });
      return;
    }

    const project = store.getProject(chat.projectId);
    if (!project) {
      res.status(404).json({ error: "Unknown project." });
      return;
    }

    const currentDetail = await getChatDetail(chat.id);
    const latestTurn = currentDetail.thread.turns.at(-1) ?? null;
    if (currentDetail.liveState.runningTurnId || latestTurn?.status === "inProgress") {
      res.status(409).json({
        error: "Cannot compact a thread while a turn is still running."
      });
      return;
    }

    await codex.compactThread(chat.threadId, chat.cwd);
    const detail = await getChatDetail(chat.id);
    res.json(detail);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/chats/:chatId/messages", async (req, res) => {
  try {
    const chat = store.getChat(req.params.chatId);
    if (!chat) {
      res.status(404).json({ error: "Unknown chat." });
      return;
    }

    const project = store.getProject(chat.projectId);
    if (!project) {
      res.status(404).json({ error: "Unknown project." });
      return;
    }

    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!text) {
      res.status(400).json({
        error: "Message text is required."
      });
      return;
    }

    store.setSelection(project.id, chat.id);
    const turn = await codex.sendMessage(chat.threadId, chat.cwd, text);
    store.updateChatLaunchState(chat.id, "active");
    res.status(202).json(turn);
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.get("/events", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();
  res.write(`data: ${JSON.stringify({ type: "state.selection", payload: store.getSnapshot().selection })}\n\n`);

  sseClients.add(res);

  const heartbeat = setInterval(() => {
    res.write(": keepalive\n\n");
  }, 15000);

  req.on("close", () => {
    clearInterval(heartbeat);
    sseClients.delete(res);
  });
});

if (existsSync(clientDistDir)) {
  app.use(express.static(clientDistDir));
  app.get(/^(?!\/api|\/events).*/, (_req, res) => {
    res.sendFile(resolve(clientDistDir, "index.html"));
  });
}

app.listen(PORT, () => {
  // Keep startup log concise because the web UI is the primary surface.
  console.log(`Coordex server listening on http://localhost:${PORT}`);
});
