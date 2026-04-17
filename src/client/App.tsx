import { FormEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";

import { AGENT_PROJECT_TEMPLATES } from "../shared/agents";
import type { AuthSummary, ChatDetail, CoordexChat, CoordexEvent, CoordexProject, ProjectBundle } from "../shared/types";
import { api } from "./api";

type Notice = {
  tone: "error" | "info";
  message: string;
};

type SidebarComposerMode = "chat" | "agent" | null;

const DEFAULT_SIDEBAR_WIDTH = 340;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 560;
const SIDEBAR_WIDTH_STORAGE_KEY = "coordex.sidebarWidth";

function formatTime(value: string | number | null | undefined): string {
  if (!value) {
    return "—";
  }

  const date = typeof value === "number" ? new Date(value * 1000) : new Date(value);
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function describeChatScope(chat: CoordexChat, project: CoordexProject): string {
  const normalizedRoot = project.rootPath.replace(/\\/g, "/");
  const normalizedCwd = chat.cwd.replace(/\\/g, "/");

  if (chat.kind === "agent") {
    return chat.roleDirectory ? `${chat.roleDirectory}/` : normalizedCwd;
  }

  if (normalizedCwd === normalizedRoot) {
    return "root";
  }

  if (normalizedCwd.startsWith(`${normalizedRoot}/`)) {
    return normalizedCwd.slice(normalizedRoot.length + 1);
  }

  return normalizedCwd;
}

function renderItem(item: ChatDetail["thread"]["turns"][number]["items"][number]) {
  switch (item.type) {
    case "userMessage":
      return {
        kind: "user" as const,
        title: "User",
        body: item.content
          .map((content) => content.text ?? content.path ?? content.url ?? content.type)
          .join("\n")
      };
    case "agentMessage":
      return {
        kind: "assistant" as const,
        title: "Codex",
        body: item.text
      };
    case "plan":
      return {
        kind: "system" as const,
        title: "Plan",
        body: item.text
      };
    case "reasoning":
      return {
        kind: "system" as const,
        title: "Reasoning",
        body: item.summary.join("\n")
      };
    case "commandExecution":
      return {
        kind: "system" as const,
        title: item.command,
        body: item.aggregatedOutput || item.status
      };
    case "fileChange":
      return {
        kind: "system" as const,
        title: "File changes",
        body: item.changes.map((change) => change.path).join("\n")
      };
    case "mcpToolCall":
      return {
        kind: "system" as const,
        title: `${item.server} / ${item.tool}`,
        body: item.status
      };
    case "webSearch":
      return {
        kind: "system" as const,
        title: "Web search",
        body: item.query
      };
    default:
      return {
        kind: "system" as const,
        title: item.type,
        body: ""
      };
  }
}

function formatThreadStatus(status: unknown): string {
  if (typeof status === "string") {
    return status;
  }

  if (status && typeof status === "object") {
    const type = Reflect.get(status, "type");
    if (typeof type === "string") {
      return type;
    }

    try {
      return JSON.stringify(status);
    } catch {
      return "unknown";
    }
  }

  return "unknown";
}

function getInitialSidebarWidth(): number {
  if (typeof window === "undefined") {
    return DEFAULT_SIDEBAR_WIDTH;
  }

  const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
  const parsed = raw ? Number(raw) : Number.NaN;
  if (!Number.isFinite(parsed)) {
    return DEFAULT_SIDEBAR_WIDTH;
  }

  return Math.min(MAX_SIDEBAR_WIDTH, Math.max(MIN_SIDEBAR_WIDTH, parsed));
}

function timelineLength(detail: ChatDetail | null): number {
  if (!detail) {
    return 0;
  }

  return detail.thread.turns.reduce((count, turn) => count + turn.items.length, 0);
}

export function App() {
  const [auth, setAuth] = useState<AuthSummary | null>(null);
  const [projects, setProjects] = useState<CoordexProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectBundle, setProjectBundle] = useState<ProjectBundle | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatDetail, setChatDetail] = useState<ChatDetail | null>(null);
  const [draftAssistantText, setDraftAssistantText] = useState("");
  const [messageText, setMessageText] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectRootPath, setProjectRootPath] = useState("");
  const [chatTitle, setChatTitle] = useState("");
  const [customRoleName, setCustomRoleName] = useState("");
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [sidebarComposerMode, setSidebarComposerMode] = useState<SidebarComposerMode>(null);
  const [agentProjectTemplateKey, setAgentProjectTemplateKey] = useState(AGENT_PROJECT_TEMPLATES[0]?.key ?? "");
  const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState({
    boot: true,
    project: false,
    chat: false,
    agent: false,
    send: false,
    login: false
  });

  const appShellRef = useRef<HTMLElement | null>(null);
  const isResizingRef = useRef(false);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);

  const selectedProject = useMemo(() => {
    return projects.find((project) => project.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);

  const selectedAgentProjectTemplate = useMemo(() => {
    return AGENT_PROJECT_TEMPLATES.find((template) => template.key === agentProjectTemplateKey) ?? AGENT_PROJECT_TEMPLATES[0] ?? null;
  }, [agentProjectTemplateKey]);

  const chats = projectBundle?.chats ?? [];

  const refreshBootstrap = async () => {
    const payload = await api.bootstrap();
    setAuth(payload.auth);
    setProjects(payload.projects);
    setSelectedProjectId(payload.selection.projectId);
    setSelectedChatId(payload.selection.chatId);
    return payload;
  };

  const loadProject = async (projectId: string, syncSelection = true) => {
    setBusy((current) => ({ ...current, project: true }));
    try {
      if (syncSelection) {
        await api.setSelection({ projectId, chatId: null });
      }

      const bundle = await api.getProject(projectId);
      setProjectBundle(bundle);
      setSelectedProjectId(projectId);
      setProjects((current) =>
        current
          .map((project) => (project.id === bundle.project.id ? bundle.project : project))
          .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
      );
      setNotice(null);
      return bundle;
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      setBusy((current) => ({ ...current, project: false }));
    }
  };

  const loadChat = async (chatId: string, projectId: string, syncSelection = true) => {
    setBusy((current) => ({ ...current, chat: true }));
    try {
      if (syncSelection) {
        await api.setSelection({ projectId, chatId });
      }

      const detail = await api.getChat(chatId);
      setChatDetail(detail);
      setSelectedProjectId(projectId);
      setSelectedChatId(chatId);
      setDraftAssistantText(detail.liveState.draftAssistantText);
      setNotice(null);
      return detail;
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
      throw error;
    } finally {
      setBusy((current) => ({ ...current, chat: false }));
    }
  };

  const openProject = async (projectId: string, syncSelection = true) => {
    const bundle = await loadProject(projectId, syncSelection);
    if (bundle.chats[0]) {
      await loadChat(bundle.chats[0].id, bundle.project.id, syncSelection);
      return;
    }

    setSelectedChatId(null);
    setChatDetail(null);
    setDraftAssistantText("");
    if (syncSelection) {
      await api.setSelection({ projectId, chatId: null });
    }
  };

  useEffect(() => {
    const boot = async () => {
      try {
        const payload = await refreshBootstrap();

        if (!payload.projects.length) {
          setProjectFormOpen(true);
          return;
        }

        const projectId = payload.selection.projectId ?? payload.projects[0]?.id ?? null;
        if (!projectId) {
          return;
        }

        const bundle = await loadProject(projectId, false);
        if (payload.selection.chatId) {
          await loadChat(payload.selection.chatId, bundle.project.id, false);
        } else if (bundle.chats[0]) {
          await loadChat(bundle.chats[0].id, bundle.project.id, true);
        }
      } catch (error) {
        setNotice({
          tone: "error",
          message: error instanceof Error ? error.message : String(error)
        });
      } finally {
        setBusy((current) => ({ ...current, boot: false }));
      }
    };

    void boot();
  }, []);

  useEffect(() => {
    const source = new EventSource("/events");

    source.onmessage = (event) => {
      const payload = JSON.parse(event.data) as CoordexEvent;

      if (payload.type === "auth.summary") {
        setAuth(payload.payload);
        return;
      }

      if (payload.type === "state.selection") {
        return;
      }

      const method = payload.payload.method;
      const params = payload.payload.params;

      if (method === "item/agentMessage/delta" && chatDetail && params.threadId === chatDetail.chat.threadId) {
        const delta = typeof params.delta === "string" ? params.delta : "";
        setDraftAssistantText((current) => `${current}${delta}`);
        return;
      }

      if (method === "turn/started" && chatDetail && params.threadId === chatDetail.chat.threadId) {
        setDraftAssistantText("");
        return;
      }

      if (method === "turn/completed" && chatDetail && params.threadId === chatDetail.chat.threadId) {
        setDraftAssistantText("");
        void loadChat(chatDetail.chat.id, chatDetail.project.id, false);
        void loadProject(chatDetail.project.id, false);
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => {
      source.close();
    };
  }, [chatDetail]);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidth));
  }, [sidebarWidth]);

  useEffect(() => {
    const handleMouseMove = (event: MouseEvent) => {
      if (!isResizingRef.current || !appShellRef.current) {
        return;
      }

      const rect = appShellRef.current.getBoundingClientRect();
      const maxAllowed = Math.min(MAX_SIDEBAR_WIDTH, rect.width - 360);
      const nextWidth = Math.max(MIN_SIDEBAR_WIDTH, Math.min(maxAllowed, event.clientX - rect.left));
      setSidebarWidth(nextWidth);
    };

    const stopResize = () => {
      if (!isResizingRef.current) {
        return;
      }

      isResizingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", stopResize);

    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", stopResize);
    };
  }, []);

  useEffect(() => {
    const node = threadScrollRef.current;
    if (!node) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      node.scrollTo({
        top: node.scrollHeight,
        behavior: draftAssistantText ? "smooth" : "auto"
      });
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [selectedChatId, chatDetail?.thread.updatedAt, timelineLength(chatDetail), draftAssistantText]);

  const closeSidebarComposer = () => {
    setSidebarComposerMode(null);
    setChatTitle("");
    setCustomRoleName("");
  };

  const openSidebarComposer = async (mode: Exclude<SidebarComposerMode, null>) => {
    if (!selectedProjectId && projects[0]) {
      await openProject(projects[0].id);
    }

    setSidebarComposerMode(mode);
    setNotice(null);
  };

  const handleBeginResize = (event: ReactMouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    isResizingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
  };

  const handleProjectChange = async (nextProjectId: string) => {
    if (!nextProjectId || nextProjectId === selectedProjectId) {
      return;
    }

    closeSidebarComposer();
    await openProject(nextProjectId);
  };

  const handleProjectCreate = async (event: FormEvent) => {
    event.preventDefault();
    setBusy((current) => ({ ...current, project: true }));

    try {
      const bundle = await api.createProject({
        name: projectName,
        rootPath: projectRootPath
      });

      setProjects((current) => [bundle.project, ...current]);
      setProjectBundle(bundle);
      setSelectedProjectId(bundle.project.id);
      setProjectName("");
      setProjectRootPath("");
      setProjectFormOpen(false);
      setNotice(null);

      if (bundle.chats[0]) {
        await loadChat(bundle.chats[0].id, bundle.project.id);
      } else {
        setSelectedChatId(null);
        setChatDetail(null);
      }
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusy((current) => ({ ...current, project: false }));
    }
  };

  const handleChatCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!selectedProjectId) {
      return;
    }

    setBusy((current) => ({ ...current, chat: true }));

    try {
      const detail = await api.createChat(selectedProjectId, {
        title: chatTitle
      });

      const bundle = await loadProject(selectedProjectId, false);
      setProjectBundle(bundle);
      setChatDetail(detail);
      setSelectedChatId(detail.chat.id);
      setChatTitle("");
      setDraftAssistantText("");
      closeSidebarComposer();
      setNotice(null);
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusy((current) => ({ ...current, chat: false }));
    }
  };

  const createAgent = async (input: { projectTemplateKey?: string; templateKey?: string; roleName?: string }) => {
    if (!selectedProjectId) {
      return;
    }

    setBusy((current) => ({ ...current, agent: true }));

    try {
      const detail = await api.createAgent(selectedProjectId, input);
      const bundle = await loadProject(selectedProjectId, false);
      setProjectBundle(bundle);
      setChatDetail(detail);
      setSelectedChatId(detail.chat.id);
      setDraftAssistantText("");
      closeSidebarComposer();
      setNotice({
        tone: "info",
        message: `Created ${detail.chat.roleName ?? detail.chat.title} in ${detail.chat.cwd}.`
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusy((current) => ({ ...current, agent: false }));
    }
  };

  const handleCustomAgentCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!customRoleName.trim()) {
      return;
    }

    await createAgent({
      projectTemplateKey: selectedAgentProjectTemplate?.key,
      roleName: customRoleName
    });
  };

  const handleMessageSend = async (event: FormEvent) => {
    event.preventDefault();
    if (!chatDetail || !messageText.trim()) {
      return;
    }

    setBusy((current) => ({ ...current, send: true }));

    try {
      await api.sendMessage(chatDetail.chat.id, {
        text: messageText
      });
      setMessageText("");
      setDraftAssistantText("");
      setNotice({
        tone: "info",
        message: "Message submitted to Codex."
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusy((current) => ({ ...current, send: false }));
    }
  };

  const handleLoginStart = async () => {
    setBusy((current) => ({ ...current, login: true }));
    try {
      const payload = await api.startChatgptLogin();
      window.open(payload.authUrl, "_blank", "noopener,noreferrer");
      setNotice({
        tone: "info",
        message: `Opened ChatGPT login flow (${payload.loginId}).`
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusy((current) => ({ ...current, login: false }));
    }
  };

  const timeline = useMemo(() => {
    if (!chatDetail) {
      return [];
    }

    return chatDetail.thread.turns.flatMap((turn) => turn.items.map((item) => ({ turnId: turn.id, item })));
  }, [chatDetail]);

  if (busy.boot) {
    return <main className="loading-screen">Loading Coordex...</main>;
  }

  return (
    <main
      ref={appShellRef}
      className="app-shell"
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`
        } as React.CSSProperties
      }
    >
      <aside className="sidebar-shell">
        <header className="sidebar-header">
          <div>
            <p className="eyebrow">Coordination</p>
            <h1>Coordex</h1>
            <p className="sidebar-copy">Fixed project controls on the left, live Codex thread context on the right.</p>
          </div>
          <button className="primary-button sidebar-new-project" onClick={() => setProjectFormOpen((current) => !current)}>
            {projectFormOpen ? "Close" : "New Project"}
          </button>
        </header>

        {projectFormOpen ? (
          <form className="sidebar-form" onSubmit={handleProjectCreate}>
            <label>
              <span>Name</span>
              <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="SlgGame" />
            </label>
            <label>
              <span>Root path</span>
              <input
                value={projectRootPath}
                onChange={(event) => setProjectRootPath(event.target.value)}
                placeholder="/Users/mawei/MyWork/SlgGame"
              />
            </label>
            <div className="inline-actions">
              <button className="primary-button" disabled={busy.project}>
                {busy.project ? "Saving..." : "Create Project"}
              </button>
              <button className="ghost-button" type="button" onClick={() => setProjectFormOpen(false)}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        {projects.length ? (
          <section className="project-switcher">
            <label>
              <span>Project</span>
              <select
                value={selectedProjectId ?? ""}
                onChange={(event) => void handleProjectChange(event.target.value)}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>

            {selectedProject ? (
              <div className="project-meta">
                <strong>{selectedProject.name}</strong>
                <span className="path-text">{selectedProject.rootPath}</span>
                <small>Opened {formatTime(selectedProject.lastOpenedAt)}</small>
              </div>
            ) : null}

            <div className="project-toolbar">
              <button
                className="action-chip"
                onClick={() => selectedProjectId && void loadProject(selectedProjectId, false)}
                disabled={!selectedProjectId || busy.project}
              >
                Refresh
              </button>
              <button
                className="action-chip"
                onClick={() => void openSidebarComposer("chat")}
                disabled={!selectedProjectId || busy.chat}
              >
                + Chat
              </button>
              <button
                className="action-chip action-chip-accent"
                onClick={() => void openSidebarComposer("agent")}
                disabled={!selectedProjectId || busy.agent}
              >
                + Agent
              </button>
            </div>
          </section>
        ) : null}

        {sidebarComposerMode === "chat" && selectedProject ? (
          <form className="sidebar-composer" onSubmit={handleChatCreate}>
            <div className="composer-header">
              <strong>New root chat</strong>
              <button className="ghost-link" type="button" onClick={closeSidebarComposer}>
                Cancel
              </button>
            </div>
            <input value={chatTitle} onChange={(event) => setChatTitle(event.target.value)} placeholder="Planning thread" />
            <button className="primary-button" disabled={busy.chat}>
              {busy.chat ? "Creating..." : "Create Chat"}
            </button>
          </form>
        ) : null}

        {sidebarComposerMode === "agent" && selectedProject ? (
          <section className="sidebar-composer">
            <div className="composer-header">
              <strong>New agent thread</strong>
              <button className="ghost-link" type="button" onClick={closeSidebarComposer}>
                Cancel
              </button>
            </div>

            <label>
              <span>Project template</span>
              <select value={agentProjectTemplateKey} onChange={(event) => setAgentProjectTemplateKey(event.target.value)}>
                {AGENT_PROJECT_TEMPLATES.map((template) => (
                  <option key={template.key} value={template.key}>
                    {template.label}
                  </option>
                ))}
              </select>
            </label>

            {selectedAgentProjectTemplate ? (
              <div className="template-note">
                <strong>{selectedAgentProjectTemplate.label}</strong>
                <span>{selectedAgentProjectTemplate.description}</span>
              </div>
            ) : null}

            <div className="role-chip-grid">
              {selectedAgentProjectTemplate?.roles.map((template) => (
                <button
                  key={template.key}
                  className="role-chip"
                  onClick={() =>
                    void createAgent({
                      projectTemplateKey: selectedAgentProjectTemplate.key,
                      templateKey: template.key
                    })
                  }
                  disabled={busy.agent}
                >
                  <strong>{template.label}</strong>
                  <span>{selectedAgentProjectTemplate.directoryName}/{template.directoryName}</span>
                </button>
              ))}
            </div>

            <form className="inline-form" onSubmit={handleCustomAgentCreate}>
              <input
                value={customRoleName}
                onChange={(event) => setCustomRoleName(event.target.value)}
                placeholder="custom role name"
              />
              <button className="secondary-button" disabled={busy.agent || !customRoleName.trim()}>
                {busy.agent ? "Creating..." : "Custom Role"}
              </button>
            </form>
          </section>
        ) : null}

        {notice ? <div className={`notice notice-${notice.tone}`}>{notice.message}</div> : null}

        <div className="thread-list-panel">
          <div className="thread-list-header">
            <p className="eyebrow">Threads</p>
            <h2>{selectedProject?.name ?? "No project"}</h2>
          </div>

          <div className="thread-tree">
            {selectedProject ? (
              chats.length ? (
                chats.map((chat) => (
                  <button
                    key={chat.id}
                    className={`thread-link ${chat.id === selectedChatId ? "selected" : ""}`}
                    onClick={() => void loadChat(chat.id, chat.projectId)}
                  >
                    <div className="thread-link-row">
                      <strong>{chat.title}</strong>
                      <span className={`pill pill-kind-${chat.kind}`}>{chat.kind}</span>
                    </div>
                    <span>{describeChatScope(chat, selectedProject)}</span>
                    <small>Updated {formatTime(chat.lastOpenedAt)}</small>
                  </button>
                ))
              ) : (
                <p className="empty-note">No chats yet. Use the fixed toolbar above to create one.</p>
              )
            ) : (
              <p className="empty-note">Create or select a project first.</p>
            )}
          </div>
        </div>

        <footer className="sidebar-footer">
          <div className="auth-inline">
            <span className={`auth-badge auth-${auth?.status ?? "unknown"}`}>{auth?.status ?? "unknown"}</span>
            <div>
              <strong>{auth?.email ?? "No active Codex account detected."}</strong>
              <p className="muted">{auth?.mode ? `${auth.mode} · ${auth.planType ?? "plan unknown"}` : "ChatGPT login available."}</p>
            </div>
          </div>
          <button className="ghost-button" onClick={handleLoginStart} disabled={busy.login}>
            {busy.login ? "Opening..." : "Start ChatGPT Login"}
          </button>
        </footer>
      </aside>

      <div
        className="layout-splitter"
        role="separator"
        aria-orientation="vertical"
        aria-label="Resize sidebar"
        onMouseDown={handleBeginResize}
      >
        <span />
      </div>

      <section className="thread-stage">
        <header className="thread-stage-header">
          <div>
            <p className="eyebrow">Thread</p>
            <h2>{chatDetail?.chat.title ?? "No chat selected"}</h2>
            <p className="muted">
              {chatDetail
                ? `${chatDetail.chat.cwd} · ${formatThreadStatus(chatDetail.thread.status)}`
                : "Select a project thread from the left sidebar."}
            </p>
          </div>
          {chatDetail ? <span className={`pill pill-kind-${chatDetail.chat.kind}`}>{chatDetail.chat.kind}</span> : null}
        </header>

        <div className="thread-scroll" ref={threadScrollRef}>
          {chatDetail ? (
            timeline.length || draftAssistantText ? (
              <>
                {timeline.map(({ turnId, item }) => {
                  const rendered = renderItem(item);
                  return (
                    <article key={`${turnId}-${item.id}`} className={`message-card message-${rendered.kind}`}>
                      <header>
                        <span>{rendered.title}</span>
                        <small>{turnId.slice(0, 8)}</small>
                      </header>
                      {rendered.body ? <pre>{rendered.body}</pre> : null}
                    </article>
                  );
                })}
                {draftAssistantText ? (
                  <article className="message-card message-assistant live">
                    <header>
                      <span>Codex</span>
                      <small>live</small>
                    </header>
                    <pre>{draftAssistantText}</pre>
                  </article>
                ) : null}
              </>
            ) : (
              <div className="empty-thread">
                <h3>No turns yet</h3>
                <p>Send the first message from the composer below.</p>
              </div>
            )
          ) : (
            <div className="empty-thread">
              <h3>Nothing loaded yet</h3>
              <p>Pick a project and a thread from the left side.</p>
            </div>
          )}
        </div>

        <footer className="composer">
          <form onSubmit={handleMessageSend}>
            <textarea
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              placeholder="Send a plain-text instruction into the selected Codex thread..."
              disabled={!chatDetail || busy.send}
            />
            <div className="composer-row">
              <span className="muted">{chatDetail ? `Last updated ${formatTime(chatDetail.thread.updatedAt)}` : "No thread selected"}</span>
              <button className="primary-button" disabled={!chatDetail || busy.send || !messageText.trim()}>
                {busy.send ? "Sending..." : "Send"}
              </button>
            </div>
          </form>
        </footer>
      </section>
    </main>
  );
}
