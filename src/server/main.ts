import cors from "cors";
import express from "express";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import type { AuthSummary, BootstrapPayload, ChatDetail, CoordexEvent, ProjectBundle } from "../shared/types.js";
import { resolveAgentWorkspace } from "./agent-workspace.js";
import { CodexAppServerClient } from "./codex-app-server.js";
import { StateStore } from "./store.js";

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

  return {
    project,
    chat,
    thread,
    liveState: codex.getLiveState(chat.threadId)
  };
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
});

app.get("/api/bootstrap", async (_req, res) => {
  const snapshot = store.getSnapshot();
  const payload: BootstrapPayload = {
    auth: await readAuth(),
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
    const bundle = await getProjectBundle(project.id);
    res.status(201).json(bundle);
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

app.post("/api/projects/:projectId/chats", async (req, res) => {
  try {
    const project = store.getProject(req.params.projectId);
    if (!project) {
      res.status(404).json({ error: "Unknown project." });
      return;
    }

    const title = typeof req.body?.title === "string" ? req.body.title.trim() : "";
    const thread = await codex.createThread(project.rootPath, title || "New chat");
    const chat = store.registerChat(project.id, {
      threadId: thread.threadId,
      title: title || "New chat",
      source: "coordex",
      kind: "chat",
      cwd: project.rootPath,
      roleName: null,
      roleDirectory: null
    });
    const detail = await getChatDetail(chat.id);
    res.status(201).json(detail);
  } catch (error) {
    res.status(400).json({
      error: error instanceof Error ? error.message : String(error)
    });
  }
});

app.post("/api/projects/:projectId/agents", async (req, res) => {
  try {
    const project = store.getProject(req.params.projectId);
    if (!project) {
      res.status(404).json({ error: "Unknown project." });
      return;
    }

    const workspace = resolveAgentWorkspace(project.rootPath, {
      projectTemplateKey: typeof req.body?.projectTemplateKey === "string" ? req.body.projectTemplateKey : undefined,
      templateKey: typeof req.body?.templateKey === "string" ? req.body.templateKey : undefined,
      roleName: typeof req.body?.roleName === "string" ? req.body.roleName : undefined
    });

    const thread = await codex.createThread(workspace.cwd, workspace.chatTitle);
    const chat = store.registerChat(project.id, {
      threadId: thread.threadId,
      title: workspace.chatTitle,
      source: "coordex",
      kind: "agent",
      cwd: workspace.cwd,
      roleName: workspace.roleName,
      roleDirectory: workspace.roleDirectory
    });
    const detail = await getChatDetail(chat.id);
    res.status(201).json(detail);
  } catch (error) {
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
