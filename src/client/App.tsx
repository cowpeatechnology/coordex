import { CSSProperties, FormEvent, MouseEvent as ReactMouseEvent, useEffect, useMemo, useRef, useState } from "react";

import type { AgentProjectTemplate } from "../shared/agents";
import type {
  AuthSummary,
  ChatDetail,
  CoordexChat,
  CoordexPlanCoordination,
  CoordexEvent,
  CoordexPlanFeature,
  CoordexProject,
  CoordexProjectBoard,
  ProjectBundle
} from "../shared/types";
import { api } from "./api";

type Notice = {
  tone: "error" | "info";
  message: string;
};

type SidebarComposerMode = "chat" | "agent" | null;
type AgentSetupTab = "template" | "custom";
type ProjectLoadOptions = {
  includeBoard?: boolean;
};

type BoardDialogState =
  | { kind: "goal" }
  | { kind: "feature"; featureId: string }
  | { kind: "coordination"; featureId: string }
  | { kind: "history" }
  | null;

const DEFAULT_SIDEBAR_WIDTH = 340;
const MIN_SIDEBAR_WIDTH = 280;
const MAX_SIDEBAR_WIDTH = 560;
const SIDEBAR_WIDTH_STORAGE_KEY = "coordex.sidebarWidth";
const APP_SHELL_HORIZONTAL_PADDING = 36;
const APP_SHELL_TOTAL_COLUMN_GAP = 24;
const APP_SHELL_SPLITTER_WIDTH = 12;
const MIN_THREAD_STAGE_WIDTH = 360;
const EXECUTION_MODEL_OPTIONS = ["gpt-5.4", "gpt-5.4-mini", "gpt-5.4-nano"];
const EXECUTION_REASONING_OPTIONS = ["none", "low", "medium", "high", "xhigh"];

function trimOrEmpty(value: string | null | undefined): string {
  return value?.trim() || "";
}

function withCurrentOption(options: string[], current: string): string[] {
  if (!current || options.includes(current)) {
    return options;
  }

  return [current, ...options];
}

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

function formatExecutionProfile(detail: ChatDetail | null): string {
  const model = detail?.executionProfile.model?.trim() || "";
  const effort = detail?.executionProfile.reasoningEffort?.trim() || "";

  if (model && effort) {
    return `${model} · ${effort}`;
  }

  if (model) {
    return model;
  }

  if (effort) {
    return `effort ${effort}`;
  }

  return "profile default";
}

function formatTokenCount(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${(value / 1_000_000).toFixed(1).replace(/\\.0$/, "")}m`;
  }

  if (abs >= 1_000) {
    return `${(value / 1_000).toFixed(1).replace(/\\.0$/, "")}k`;
  }

  return value.toLocaleString();
}

function formatContextWindowUsage(detail: ChatDetail | null): string {
  const usage = detail?.tokenUsage;
  if (!usage) {
    return "ctx —";
  }

  const used = usage.last.inputTokens;
  if (usage.modelContextWindow && usage.modelContextWindow > 0) {
    return `ctx ${formatTokenCount(used)} / ${formatTokenCount(usage.modelContextWindow)}`;
  }

  return `ctx ${formatTokenCount(used)}`;
}

function getContextWindowUsageTitle(detail: ChatDetail | null): string {
  const usage = detail?.tokenUsage;
  if (!usage) {
    return "Current thread context usage is not available yet. Codex app-server reports it after a completed turn.";
  }

  const lines = [
    `Current prompt window: ${usage.last.inputTokens.toLocaleString()} tokens`,
    `Latest turn total: ${usage.last.totalTokens.toLocaleString()} tokens`,
    `Latest turn cached input: ${usage.last.cachedInputTokens.toLocaleString()} tokens`,
    `Latest turn output: ${usage.last.outputTokens.toLocaleString()} tokens`,
    `Latest turn reasoning: ${usage.last.reasoningOutputTokens.toLocaleString()} tokens`,
    `Thread cumulative total: ${usage.total.totalTokens.toLocaleString()} tokens`
  ];

  if (usage.modelContextWindow && usage.modelContextWindow > 0) {
    const percent = Math.min(100, (usage.last.inputTokens / usage.modelContextWindow) * 100);
    lines.unshift(`Context window: ${usage.modelContextWindow.toLocaleString()} tokens`);
    lines.push(`Window used: ${percent.toFixed(1)}%`);
  }

  return lines.join("\n");
}

function readInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function readNotificationTokenUsage(params: Record<string, unknown> | undefined): ChatDetail["tokenUsage"] {
  const turnId = typeof params?.turnId === "string" ? params.turnId : null;
  const tokenUsage = params?.tokenUsage;

  if (!turnId || !tokenUsage || typeof tokenUsage !== "object") {
    return null;
  }

  const readBreakdown = (value: unknown) => {
    if (!value || typeof value !== "object") {
      return null;
    }

    const cachedInputTokens = readInteger(Reflect.get(value, "cachedInputTokens"));
    const inputTokens = readInteger(Reflect.get(value, "inputTokens"));
    const outputTokens = readInteger(Reflect.get(value, "outputTokens"));
    const reasoningOutputTokens = readInteger(Reflect.get(value, "reasoningOutputTokens"));
    const totalTokens = readInteger(Reflect.get(value, "totalTokens"));

    if (
      cachedInputTokens === null ||
      inputTokens === null ||
      outputTokens === null ||
      reasoningOutputTokens === null ||
      totalTokens === null
    ) {
      return null;
    }

    return {
      cachedInputTokens,
      inputTokens,
      outputTokens,
      reasoningOutputTokens,
      totalTokens
    };
  };

  const last = readBreakdown(Reflect.get(tokenUsage, "last"));
  const total = readBreakdown(Reflect.get(tokenUsage, "total"));
  if (!last || !total) {
    return null;
  }

  return {
    last,
    total,
    modelContextWindow: readInteger(Reflect.get(tokenUsage, "modelContextWindow")),
    turnId
  };
}

function describeChatResponsibility(chat: CoordexChat, templates: AgentProjectTemplate[]): string {
  if (chat.kind !== "agent") {
    return "General project discussion and shared workspace context.";
  }

  const roleName = normalizeRoleName(chat.roleName);

  for (const template of templates) {
    const role = template.roles.find((candidate) => normalizeRoleName(candidate.label) === roleName);
    if (role) {
      return role.description;
    }
  }

  return chat.roleName ? `${chat.roleName} role-specific conversation.` : "Role-specific conversation.";
}

function isPendingAgent(chat: CoordexChat | null | undefined): boolean {
  return chat?.kind === "agent" && chat.launchState === "pending";
}

function getAgentVisibilityNote(chat: CoordexChat | null | undefined): string | null {
  if (chat?.kind !== "agent") {
    return null;
  }

  if (chat.launchState === "pending") {
    return "This agent exists, but it has no turns yet. Send the first message to activate it. Even after activation, the official Codex project view may still omit role threads started under Agents/<role>/.";
  }

  return "This role thread is active in Coordex, but the official Codex project view may still omit role threads started under Agents/<role>/ because they are subdirectory conversations rather than root-level project chats.";
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
    case "compaction":
      return {
        kind: "system" as const,
        title: "Context Compact",
        body: "Older thread context was compacted into a hidden summary."
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
    return clampSidebarWidthForViewport(DEFAULT_SIDEBAR_WIDTH, window.innerWidth);
  }

  return clampSidebarWidthForViewport(parsed, window.innerWidth);
}

function clampSidebarWidthForViewport(value: number, viewportWidth: number): number {
  const maxAllowed = Math.max(
    MIN_SIDEBAR_WIDTH,
    Math.min(
      MAX_SIDEBAR_WIDTH,
      viewportWidth -
        APP_SHELL_HORIZONTAL_PADDING -
        APP_SHELL_TOTAL_COLUMN_GAP -
        APP_SHELL_SPLITTER_WIDTH -
        MIN_THREAD_STAGE_WIDTH
    )
  );

  return Math.min(maxAllowed, Math.max(MIN_SIDEBAR_WIDTH, value));
}

function timelineLength(detail: ChatDetail | null): number {
  if (!detail) {
    return 0;
  }

  return detail.thread.turns.reduce((count, turn) => count + turn.items.length, 0);
}

function normalizeRoleName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function isStoppedTurnStatus(status: string | null | undefined): boolean {
  return status === "failed" || status === "cancelled" || status === "interrupted";
}

function isSettledTurnStatus(status: string | null | undefined): boolean {
  return Boolean(status && status !== "inProgress");
}

function getLatestTurn(detail: ChatDetail | null | undefined) {
  return detail?.thread.turns.at(-1) ?? null;
}

function describeStoppedTurnStatus(status: string | null | undefined): string {
  switch (status) {
    case "failed":
      return "failed";
    case "cancelled":
      return "cancelled";
    case "interrupted":
      return "interrupted";
    default:
      return "stopped";
  }
}

function truncateText(value: string, maxLength: number): string {
  const trimmed = value.trim();
  if (!trimmed) {
    return "";
  }

  if (trimmed.length <= maxLength) {
    return trimmed;
  }

  return `${trimmed.slice(0, maxLength).trimEnd()}…`;
}

function needsThreadResponsibilityDetails(value: string): boolean {
  return value.trim().length > 56;
}

function describeFeatureState(feature: CoordexPlanFeature): string {
  if (feature.done) {
    return "Completed";
  }

  if (feature.runState === "running") {
    return "Running";
  }

  if (feature.runState === "blocked") {
    return "Blocked";
  }

  return "Open";
}

function buildFeatureSummary(feature: CoordexPlanFeature): string {
  const title = feature.title.trim() || "Untitled subfunction";
  const description = feature.description.trim();
  const ownerRole = feature.ownerRole.trim();
  const summaryParts = [title];

  if (description && description !== title) {
    summaryParts.push(description);
  }

  if (ownerRole) {
    summaryParts.push(ownerRole);
  }

  return summaryParts.join(" · ");
}

function getCoordinationLabel(coordination: CoordexPlanCoordination): string {
  const fromRole = coordination.fromRole.trim() || "unknown";
  const toRole = coordination.toRole.trim() || "unknown";
  return `${fromRole} ↔ ${toRole}`;
}

function formatCoordinationKind(value: CoordexPlanCoordination["kind"]): string {
  switch (value) {
    case "dispatch":
      return "dispatch";
    case "question":
      return "question";
    case "blocker":
      return "blocker";
    case "handoff":
      return "handoff";
    case "result":
      return "result";
    case "decision":
      return "decision";
  }
}

function formatCoordinationStatus(value: CoordexPlanCoordination["status"]): string {
  switch (value) {
    case "open":
      return "open";
    case "answered":
      return "answered";
    case "blocked":
      return "blocked";
    case "done":
      return "done";
  }
}

function renderFeaturePreviewCard(feature: CoordexPlanFeature) {
  return (
    <div className="board-hover-card" role="presentation">
      <strong>{feature.title || "Untitled subfunction"}</strong>
      <div className="board-hover-pills">
        <span className={`pill ${feature.done ? "pill-kind-chat" : "pill-kind-agent"}`}>{describeFeatureState(feature).toLowerCase()}</span>
        <span className="pill pill-kind-chat">{feature.ownerRole || "unassigned"}</span>
      </div>
      <p>{feature.description || "No detailed description recorded for this subfunction."}</p>
    </div>
  );
}

function renderCoordinationPreviewCard(feature: CoordexPlanFeature) {
  const previewItems = feature.coordinations.slice(0, 3);

  return (
    <div className="board-hover-card board-hover-card-wide" role="presentation">
      <strong>Coordination</strong>
      {previewItems.length ? (
        <div className="board-hover-list">
          {previewItems.map((coordination) => (
            <div key={coordination.id} className="board-hover-entry">
              <div className="board-hover-pills">
                <span className="pill pill-kind-chat">{getCoordinationLabel(coordination)}</span>
                <span className="pill pill-kind-agent">{formatCoordinationKind(coordination.kind)}</span>
                <span className="pill pill-kind-chat">{formatCoordinationStatus(coordination.status)}</span>
              </div>
              <p>{coordination.summary || coordination.input || "No structured coordination summary recorded."}</p>
            </div>
          ))}
          {feature.coordinations.length > previewItems.length ? (
            <span className="muted">+{feature.coordinations.length - previewItems.length} more record(s)</span>
          ) : null}
        </div>
      ) : (
        <p>No structured coordination record has been saved for this subfunction yet.</p>
      )}
    </div>
  );
}

function renderGoalPreviewCard(goal: string) {
  return (
    <div className="board-hover-card board-hover-card-wide" role="presentation">
      <strong>Current Goal</strong>
      <p>{goal || "No goal recorded yet."}</p>
    </div>
  );
}

function renderThreadResponsibilityPreviewCard(chat: CoordexChat, responsibility: string) {
  return (
    <div className="board-hover-card thread-link-hover-card" role="presentation">
      <strong>{chat.title}</strong>
      <div className="board-hover-pills">
        <span className={`pill pill-kind-${chat.kind}`}>{chat.kind}</span>
        {chat.roleName ? <span className="pill pill-kind-agent">{chat.roleName}</span> : null}
      </div>
      <p>{responsibility || "No responsibility summary recorded."}</p>
    </div>
  );
}

function IconPlus() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M10 4v12M4 10h12" />
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M15.5 8A6 6 0 1 0 16 12" />
      <path d="M12.5 4.5h3v3" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 14.5V16h1.5L14.2 7.3l-1.5-1.5L4 14.5Z" />
      <path d="M11.8 4.2 13.3 2.7 15.8 5.2 14.3 6.7" />
    </svg>
  );
}

function IconChat() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4 5.5h12v7H8l-4 3v-10Z" />
    </svg>
  );
}

function IconHistory() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M4.5 10a5.5 5.5 0 1 0 1.4-3.7" />
      <path d="M4.5 5.5v2.8h2.8" />
      <path d="M10 7.3v3l2 1.3" />
    </svg>
  );
}

function IconEllipsis() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="5" cy="10" r="1.4" />
      <circle cx="10" cy="10" r="1.4" />
      <circle cx="15" cy="10" r="1.4" />
    </svg>
  );
}

function IconAgent() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="6.2" r="2.3" />
      <path d="M5.5 15.8c.8-2.3 2.4-3.5 4.5-3.5s3.7 1.2 4.5 3.5" />
      <path d="M3.5 9.5h1.7M14.8 9.5h1.7" />
    </svg>
  );
}

function IconRemove() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M5 6.2h10" />
      <path d="M7.2 6.2V15h5.6V6.2" />
      <path d="M8.2 6.2V4.5h3.6v1.7" />
    </svg>
  );
}

function IconLaunch() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M6 4.5 15.2 10 6 15.5V4.5Z" />
    </svg>
  );
}

function IconCheckCircle() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <circle cx="10" cy="10" r="6.8" />
      <path d="m7.3 10.2 1.8 1.8 3.8-4.2" />
    </svg>
  );
}

function IconCompact() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="M3.8 7.2V3.8h3.4" />
      <path d="M16.2 7.2V3.8h-3.4" />
      <path d="M3.8 12.8v3.4h3.4" />
      <path d="M16.2 12.8v3.4h-3.4" />
      <path d="M7.2 7.2 10 10" />
      <path d="m12.8 7.2-2.8 2.8" />
      <path d="M7.2 12.8 10 10" />
      <path d="m12.8 12.8-2.8-2.8" />
    </svg>
  );
}

export function App() {
  const [auth, setAuth] = useState<AuthSummary | null>(null);
  const [agentProjectTemplates, setAgentProjectTemplates] = useState<AgentProjectTemplate[]>([]);
  const [projects, setProjects] = useState<CoordexProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [projectBundle, setProjectBundle] = useState<ProjectBundle | null>(null);
  const [projectBoard, setProjectBoard] = useState<CoordexProjectBoard | null>(null);
  const [selectedChatId, setSelectedChatId] = useState<string | null>(null);
  const [chatDetail, setChatDetail] = useState<ChatDetail | null>(null);
  const [runningTurnId, setRunningTurnId] = useState<string | null>(null);
  const [draftAssistantText, setDraftAssistantText] = useState("");
  const [messageText, setMessageText] = useState("");
  const [projectName, setProjectName] = useState("");
  const [projectRootPath, setProjectRootPath] = useState("");
  const [chatTitle, setChatTitle] = useState("");
  const [customRoleName, setCustomRoleName] = useState("");
  const [customRolePurpose, setCustomRolePurpose] = useState("");
  const [selectedTemplateRoleKeys, setSelectedTemplateRoleKeys] = useState<string[]>([]);
  const [projectFormOpen, setProjectFormOpen] = useState(false);
  const [editingProjectId, setEditingProjectId] = useState<string | null>(null);
  const [sidebarComposerMode, setSidebarComposerMode] = useState<SidebarComposerMode>(null);
  const [agentSetupTab, setAgentSetupTab] = useState<AgentSetupTab>("template");
  const [agentProjectTemplateKey, setAgentProjectTemplateKey] = useState("");
  const [sidebarWidth, setSidebarWidth] = useState(getInitialSidebarWidth);
  const [layoutRefreshNonce, setLayoutRefreshNonce] = useState(0);
  const [boardDirty, setBoardDirty] = useState(false);
  const [boardDialog, setBoardDialog] = useState<BoardDialogState>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState({
    boot: true,
    project: false,
    chat: false,
    agent: false,
    profile: false,
    send: false,
    compact: false,
    login: false,
    board: false,
    archive: false
  });

  const appShellRef = useRef<HTMLElement | null>(null);
  const isResizingRef = useRef(false);
  const threadScrollRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const liveRefreshInFlightRef = useRef(false);
  const completedRefreshInFlightRef = useRef(false);

  const selectedProject = useMemo(() => {
    return projects.find((project) => project.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);
  const isEditingProject = editingProjectId !== null;

  const selectedAgentProjectTemplate = useMemo(() => {
    return agentProjectTemplates.find((template) => template.key === agentProjectTemplateKey) ?? agentProjectTemplates[0] ?? null;
  }, [agentProjectTemplateKey, agentProjectTemplates]);
  const selectedExecutionModel = trimOrEmpty(chatDetail?.executionProfile.model) || "gpt-5.4";
  const selectedReasoningEffort = trimOrEmpty(chatDetail?.executionProfile.reasoningEffort) || "xhigh";
  const availableExecutionModels = useMemo(
    () => withCurrentOption(EXECUTION_MODEL_OPTIONS, selectedExecutionModel),
    [selectedExecutionModel]
  );
  const availableReasoningEfforts = useMemo(
    () => withCurrentOption(EXECUTION_REASONING_OPTIONS, selectedReasoningEffort),
    [selectedReasoningEffort]
  );

  const chats = projectBundle?.chats ?? [];
  const activePlan = projectBoard?.activePlan ?? null;
  const existingAgentRoleNames = useMemo(() => {
    return new Set(
      chats
        .filter((chat) => chat.kind === "agent")
        .map((chat) => normalizeRoleName(chat.roleName))
        .filter(Boolean)
    );
  }, [chats]);
  const templateRoleRows = useMemo(() => {
    return (
      selectedAgentProjectTemplate?.roles.map((role) => ({
        ...role,
        exists: existingAgentRoleNames.has(normalizeRoleName(role.label))
      })) ?? []
    );
  }, [existingAgentRoleNames, selectedAgentProjectTemplate]);
  const activeBoardDialogFeature = useMemo(() => {
    if (!activePlan || !boardDialog || boardDialog.kind === "goal" || boardDialog.kind === "history") {
      return null;
    }

    return activePlan.features.find((feature) => feature.id === boardDialog.featureId) ?? null;
  }, [activePlan, boardDialog]);

  const refreshBootstrap = async () => {
    const payload = await api.bootstrap();
    setAuth(payload.auth);
    setAgentProjectTemplates(payload.templates);
    setAgentProjectTemplateKey((current) => {
      if (!payload.templates.length) {
        return "";
      }

      return payload.templates.some((template) => template.key === current) ? current : payload.templates[0].key;
    });
    setProjects(payload.projects);
    setSelectedProjectId(payload.selection.projectId);
    setSelectedChatId(payload.selection.chatId);
    return payload;
  };

  const applyChatDetail = (detail: ChatDetail) => {
    setChatDetail(detail);
    setSelectedProjectId(detail.project.id);
    setSelectedChatId(detail.chat.id);
    setDraftAssistantText(detail.liveState.draftAssistantText);
    setRunningTurnId(detail.liveState.runningTurnId);
  };

  const latestStoppedTurn = useMemo(() => {
    if (!chatDetail || runningTurnId) {
      return null;
    }

    const latestTurn = chatDetail.thread.turns.at(-1) ?? null;
    if (!latestTurn || !isStoppedTurnStatus(latestTurn.status)) {
      return null;
    }

    return latestTurn;
  }, [chatDetail, runningTurnId]);

  const closeProjectForm = () => {
    setProjectFormOpen(false);
    setEditingProjectId(null);
    setProjectName("");
    setProjectRootPath("");
  };

  const closeSidebarComposer = () => {
    setSidebarComposerMode(null);
    setAgentSetupTab("template");
    setChatTitle("");
    setCustomRoleName("");
    setCustomRolePurpose("");
    setSelectedTemplateRoleKeys([]);
  };

  const openProjectCreateForm = () => {
    closeSidebarComposer();
    setEditingProjectId(null);
    setProjectName("");
    setProjectRootPath("");
    setProjectFormOpen(true);
    setNotice(null);
  };

  const openProjectEditForm = () => {
    if (!selectedProject) {
      return;
    }

    closeSidebarComposer();
    setEditingProjectId(selectedProject.id);
    setProjectName(selectedProject.name);
    setProjectRootPath(selectedProject.rootPath);
    setProjectFormOpen(true);
    setNotice(null);
  };

  const loadProject = async (projectId: string, syncSelection = true, options?: ProjectLoadOptions) => {
    const includeBoard = options?.includeBoard ?? true;

    setBusy((current) => ({ ...current, project: true }));
    try {
      if (syncSelection) {
        await api.setSelection({ projectId, chatId: null });
      }

      const [bundle, board] = await Promise.all([
        api.getProject(projectId),
        includeBoard ? api.getProjectBoard(projectId) : Promise.resolve(null)
      ]);

      setProjectBundle(bundle);
      if (board) {
        setProjectBoard(board);
        setBoardDirty(false);
      }
      setSelectedProjectId(projectId);
      setProjects((current) =>
        current
          .map((project) => (project.id === bundle.project.id ? bundle.project : project))
          .sort((a, b) => b.lastOpenedAt.localeCompare(a.lastOpenedAt))
      );
      setNotice(null);

      return { bundle, board };
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
      applyChatDetail(detail);
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

  const openProject = async (projectId: string, syncSelection = true, preferredChatId: string | null = null) => {
    const { bundle } = await loadProject(projectId, syncSelection, { includeBoard: true });
    const selectedChat = preferredChatId ? bundle.chats.find((chat) => chat.id === preferredChatId) ?? null : null;
    if (selectedChat) {
      await loadChat(selectedChat.id, bundle.project.id, false);
      return;
    }

    if (bundle.chats[0]) {
      await loadChat(bundle.chats[0].id, bundle.project.id, syncSelection);
      return;
    }

    setSelectedChatId(null);
    setChatDetail(null);
    setRunningTurnId(null);
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
          setProjectBoard(null);
          setRunningTurnId(null);
          openProjectCreateForm();
          return;
        }

        const projectId = payload.selection.projectId ?? payload.projects[0]?.id ?? null;
        if (!projectId) {
          return;
        }

        const { bundle } = await loadProject(projectId, false, { includeBoard: true });
        const selectedChat = payload.selection.chatId
          ? bundle.chats.find((chat) => chat.id === payload.selection.chatId) ?? null
          : null;

        if (selectedChat) {
          await loadChat(selectedChat.id, bundle.project.id, false);
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
        const nextProjectId = payload.payload.projectId;
        const nextChatId = payload.payload.chatId;

        if (nextProjectId === selectedProjectId && nextChatId === selectedChatId) {
          return;
        }

        if (!nextProjectId) {
          setSelectedProjectId(null);
          setSelectedChatId(null);
          setProjectBundle(null);
          setProjectBoard(null);
          setChatDetail(null);
          setRunningTurnId(null);
          setDraftAssistantText("");
          return;
        }

        if (nextProjectId !== selectedProjectId) {
          void openProject(nextProjectId, false, nextChatId);
          return;
        }

        if (nextChatId) {
          void loadChat(nextChatId, nextProjectId, false);
          return;
        }

        return;
      }

      if (payload.type === "project.board") {
        if (payload.payload.projectId === selectedProjectId) {
          setProjectBoard(payload.payload.board);
          setBoardDirty(false);
        }
        return;
      }

      const method = payload.payload.method;
      const params = payload.payload.params;

      if (method === "coordex/app-server-exited") {
        const code = typeof params.code === "number" ? params.code : null;
        const signal = typeof params.signal === "string" ? params.signal : null;
        setNotice({
          tone: "error",
          message: `Coordex lost its Codex app-server connection (${code ?? "null"}, ${signal ?? "null"}). Refreshing thread state.`
        });

        if (chatDetail) {
          setRunningTurnId(null);
          setDraftAssistantText("");
          void loadChat(chatDetail.chat.id, chatDetail.project.id, false).catch(() => undefined);
          void loadProject(chatDetail.project.id, false, { includeBoard: true }).catch(() => undefined);
        }
        return;
      }

      const threadId = typeof params.threadId === "string" ? params.threadId : null;
      const isCurrentThread = Boolean(chatDetail && threadId === chatDetail.chat.threadId);
      const isSelectedProjectThread = Boolean(threadId && chats.some((chat) => chat.threadId === threadId));

      if (method === "item/agentMessage/delta" && isCurrentThread) {
        const delta = typeof params.delta === "string" ? params.delta : "";
        const turnId = typeof params.turnId === "string" ? params.turnId : null;
        if (turnId) {
          setRunningTurnId(turnId);
        }
        setDraftAssistantText((current) => `${current}${delta}`);
        return;
      }

      if (method === "turn/started" && isCurrentThread) {
        const turn = params.turn;
        const turnId =
          turn && typeof turn === "object" && typeof Reflect.get(turn, "id") === "string"
            ? (Reflect.get(turn, "id") as string)
            : null;
        setRunningTurnId(turnId ?? "running");
        setDraftAssistantText("");
        void loadChat(chatDetail.chat.id, chatDetail.project.id, false);
        return;
      }

      if (method === "turn/started" && isSelectedProjectThread && selectedProjectId) {
        void loadProject(selectedProjectId, false, { includeBoard: true });
        return;
      }

      if (
        (method === "turn/completed" ||
          method === "turn/failed" ||
          method === "turn/cancelled" ||
          method === "turn/interrupted") &&
        isCurrentThread
      ) {
        setRunningTurnId(null);
        setDraftAssistantText("");
        if (method !== "turn/completed") {
          setNotice({
            tone: "error",
            message: `Current thread stopped with status "${method.replace("turn/", "")}".`
          });
        }
        void loadChat(chatDetail.chat.id, chatDetail.project.id, false);
        void loadProject(chatDetail.project.id, false, { includeBoard: true });
        return;
      }

      if (
        (method === "turn/completed" ||
          method === "turn/failed" ||
          method === "turn/cancelled" ||
          method === "turn/interrupted") &&
        isSelectedProjectThread &&
        selectedProjectId
      ) {
        void loadProject(selectedProjectId, false, { includeBoard: true });
        return;
      }

      if (method === "thread/tokenUsage/updated" && isCurrentThread) {
        const tokenUsage = readNotificationTokenUsage(params);
        if (!tokenUsage) {
          return;
        }

        setChatDetail((current) => {
          if (!current || current.chat.threadId !== threadId) {
            return current;
          }

          return {
            ...current,
            tokenUsage
          };
        });
      }
    };

    source.onerror = () => {
      // Let the browser retry the EventSource connection automatically.
    };

    return () => {
      source.close();
    };
  }, [chatDetail, chats, selectedProjectId]);

  useEffect(() => {
    if (!chatDetail || !runningTurnId) {
      return;
    }

    let cancelled = false;

    const refreshLiveThread = async () => {
      if (cancelled || liveRefreshInFlightRef.current) {
        return;
      }

      liveRefreshInFlightRef.current = true;

      try {
        const detail = await api.getChat(chatDetail.chat.id);
        if (cancelled) {
          return;
        }

        applyChatDetail(detail);

        if (!detail.liveState.runningTurnId) {
          const bundle = await api.getProject(chatDetail.project.id).catch(() => null);
          if (bundle && !cancelled) {
            setProjectBundle(bundle);
          }
        }
      } catch {
        // Keep the optimistic live state and retry on the next interval.
      } finally {
        liveRefreshInFlightRef.current = false;
      }
    };

    void refreshLiveThread();
    const intervalId = window.setInterval(() => {
      void refreshLiveThread();
    }, 1500);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [chatDetail?.chat.id, chatDetail?.project.id, runningTurnId]);

  useEffect(() => {
    if (!chatDetail || runningTurnId) {
      return;
    }

    let cancelled = false;

    const refreshCompletedThread = async () => {
      if (cancelled || completedRefreshInFlightRef.current) {
        return;
      }

      completedRefreshInFlightRef.current = true;

      try {
        const detail = await api.getChat(chatDetail.chat.id);
        if (cancelled) {
          return;
        }

        const currentLatestTurn = getLatestTurn(chatDetail);
        const nextLatestTurn = getLatestTurn(detail);
        const hasNewSettledTurn =
          Boolean(nextLatestTurn && isSettledTurnStatus(nextLatestTurn.status)) &&
          (!currentLatestTurn ||
            nextLatestTurn.id !== currentLatestTurn.id ||
            nextLatestTurn.status !== currentLatestTurn.status ||
            detail.thread.updatedAt !== chatDetail.thread.updatedAt);

        if (hasNewSettledTurn) {
          applyChatDetail(detail);
        }
      } catch {
        // Ignore passive refresh failures and keep the current thread snapshot.
      } finally {
        completedRefreshInFlightRef.current = false;
      }
    };

    const intervalId = window.setInterval(() => {
      void refreshCompletedThread();
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [chatDetail, runningTurnId]);

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
    let frameId = 0;

    const refreshLayout = () => {
      window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(() => {
        setSidebarWidth((current) => clampSidebarWidthForViewport(current, window.innerWidth));
        setLayoutRefreshNonce((current) => current + 1);
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        refreshLayout();
      }
    };

    refreshLayout();
    window.addEventListener("resize", refreshLayout);
    window.addEventListener("focus", refreshLayout);
    window.addEventListener("pageshow", refreshLayout);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.removeEventListener("resize", refreshLayout);
      window.removeEventListener("focus", refreshLayout);
      window.removeEventListener("pageshow", refreshLayout);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
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
  }, [selectedChatId, chatDetail?.thread.updatedAt, timelineLength(chatDetail), draftAssistantText, runningTurnId]);

  useEffect(() => {
    if (sidebarComposerMode !== "agent") {
      return;
    }

    setSelectedTemplateRoleKeys(templateRoleRows.filter((role) => !role.exists).map((role) => role.key));
  }, [sidebarComposerMode, selectedProjectId, templateRoleRows]);

  useEffect(() => {
    if (!boardDialog || boardDialog.kind === "goal" || boardDialog.kind === "history") {
      return;
    }

    if (!activeBoardDialogFeature) {
      setBoardDialog(null);
    }
  }, [activeBoardDialogFeature, boardDialog]);

  const openSidebarComposer = async (mode: Exclude<SidebarComposerMode, null>) => {
    if (!selectedProjectId && projects[0]) {
      await openProject(projects[0].id);
    }

    closeProjectForm();
    setSidebarComposerMode(mode);
    setNotice(null);
  };

  const toggleSidebarComposer = async (mode: Exclude<SidebarComposerMode, null>) => {
    if (sidebarComposerMode === mode) {
      closeSidebarComposer();
      return;
    }

    await openSidebarComposer(mode);
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

    closeProjectForm();
    closeSidebarComposer();
    await openProject(nextProjectId);
  };

  const handleProjectSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setBusy((current) => ({ ...current, project: true }));

    try {
      const bundle = editingProjectId
        ? await api.updateProject(editingProjectId, {
            name: projectName,
            rootPath: projectRootPath
          })
        : await api.createProject({
            name: projectName,
            rootPath: projectRootPath
          });

      const [payload, board] = await Promise.all([refreshBootstrap(), api.getProjectBoard(bundle.project.id)]);
      const selectedChat =
        payload.selection.projectId === bundle.project.id && payload.selection.chatId
          ? bundle.chats.find((chat) => chat.id === payload.selection.chatId) ?? null
          : null;

      setProjectBundle(bundle);
      setProjectBoard(board);
      setBoardDirty(false);
      setSelectedProjectId(bundle.project.id);
      closeProjectForm();
      setNotice({
        tone: "info",
        message: editingProjectId
          ? `Updated ${bundle.project.name} to ${bundle.project.rootPath}.`
          : `Registered ${bundle.project.name} at ${bundle.project.rootPath}.`
      });

      if (selectedChat) {
        await loadChat(selectedChat.id, bundle.project.id, false);
      } else if (bundle.chats[0]) {
        await loadChat(bundle.chats[0].id, bundle.project.id, true);
      } else {
        setSelectedChatId(null);
        setChatDetail(null);
        setRunningTurnId(null);
        setDraftAssistantText("");
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

  const handleProjectDelete = async () => {
    if (!selectedProject) {
      return;
    }

    const removedProjectName = selectedProject.name;
    const confirmed = window.confirm(
      `Remove ${removedProjectName} from Coordex? This only deletes Coordex local metadata and does not delete Codex threads.`
    );
    if (!confirmed) {
      return;
    }

    setBusy((current) => ({ ...current, project: true }));

    try {
      await api.deleteProject(selectedProject.id);
      closeProjectForm();
      closeSidebarComposer();
      const payload = await refreshBootstrap();

      if (!payload.projects.length) {
        setProjectBundle(null);
        setProjectBoard(null);
        setSelectedProjectId(null);
        setSelectedChatId(null);
        setChatDetail(null);
        setRunningTurnId(null);
        setDraftAssistantText("");
        openProjectCreateForm();
        setNotice({
          tone: "info",
          message: `Removed ${removedProjectName} from Coordex.`
        });
        return;
      }

      const nextProjectId = payload.selection.projectId ?? payload.projects[0]?.id ?? null;
      if (!nextProjectId) {
        return;
      }

      const preferredChatId = payload.selection.projectId === nextProjectId ? payload.selection.chatId : null;
      await openProject(nextProjectId, false, preferredChatId);
      setNotice({
        tone: "info",
        message: `Removed ${removedProjectName} from Coordex.`
      });
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

      const { bundle } = await loadProject(selectedProjectId, false, { includeBoard: false });
      setProjectBundle(bundle);
      applyChatDetail(detail);
      setChatTitle("");
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

  const createAgent = async (
    input: { projectTemplateKey?: string; templateKey?: string; roleName?: string; rolePurpose?: string },
    options?: { closeComposer?: boolean; notice?: string | null }
  ): Promise<ChatDetail | null> => {
    if (!selectedProjectId) {
      return null;
    }

    setBusy((current) => ({ ...current, agent: true }));

    try {
      const detail = await api.createAgent(selectedProjectId, input);
      const { bundle } = await loadProject(selectedProjectId, false, { includeBoard: false });
      setProjectBundle(bundle);
      applyChatDetail(detail);
      if (options?.closeComposer ?? true) {
        closeSidebarComposer();
      }
      if (options?.notice !== null) {
        setNotice({
          tone: "info",
          message: options?.notice ?? `Created and initialized ${detail.chat.roleName ?? detail.chat.title} in ${detail.chat.cwd}.`
        });
      }
      return detail;
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
      return null;
    } finally {
      setBusy((current) => ({ ...current, agent: false }));
    }
  };

  const handleCustomAgentCreate = async (event: FormEvent) => {
    event.preventDefault();
    if (!customRoleName.trim()) {
      return;
    }

    const detail = await createAgent(
      {
        projectTemplateKey: selectedAgentProjectTemplate?.key,
        roleName: customRoleName,
        rolePurpose: customRolePurpose
      },
      {
        closeComposer: true,
        notice: null
      }
    );

    if (!detail) {
      return;
    }

    setCustomRoleName("");
    setCustomRolePurpose("");
    setNotice({
      tone: "info",
      message: `Created and initialized custom role ${detail.chat.roleName ?? detail.chat.title}.`
    });
  };

  const handleTemplateRoleToggle = (roleKey: string) => {
    setSelectedTemplateRoleKeys((current) =>
      current.includes(roleKey) ? current.filter((value) => value !== roleKey) : [...current, roleKey]
    );
  };

  const handleSelectAllTemplateRoles = () => {
    setSelectedTemplateRoleKeys(templateRoleRows.filter((role) => !role.exists).map((role) => role.key));
  };

  const handleClearTemplateRoles = () => {
    setSelectedTemplateRoleKeys([]);
  };

  const handleTemplateAgentCreate = async () => {
    if (!selectedProjectId || !selectedAgentProjectTemplate) {
      return;
    }

    const rolesToCreate = templateRoleRows.filter(
      (role) => selectedTemplateRoleKeys.includes(role.key) && !role.exists
    );

    if (!rolesToCreate.length) {
      setNotice({
        tone: "info",
        message: "No new template roles are selected."
      });
      return;
    }

    setBusy((current) => ({ ...current, agent: true }));

    try {
      let lastCreated: ChatDetail | null = null;

      for (const role of rolesToCreate) {
        lastCreated = await api.createAgent(selectedProjectId, {
          projectTemplateKey: selectedAgentProjectTemplate.key,
          templateKey: role.key
        });
      }

      const { bundle } = await loadProject(selectedProjectId, false, { includeBoard: false });
      setProjectBundle(bundle);
      setDraftAssistantText("");
      setSelectedTemplateRoleKeys([]);
      if (lastCreated) {
        applyChatDetail(lastCreated);
      }
      closeSidebarComposer();

      setNotice({
        tone: "info",
        message: `Created and initialized ${rolesToCreate.length} role thread${rolesToCreate.length > 1 ? "s" : ""} from ${selectedAgentProjectTemplate.label}.`
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

  const submitMessageToChat = async (
    chatId: string,
    projectId: string,
    text: string,
    successMessage = "Message submitted to Codex."
  ): Promise<ChatDetail | null> => {
    setBusy((current) => ({ ...current, send: true }));

    try {
      const turn = await api.sendMessage(chatId, {
        text
      });
      setMessageText("");
      setRunningTurnId(turn.turnId);
      setDraftAssistantText("");

      const [detail, bundle] = await Promise.all([
        api.getChat(chatId).catch(() => null),
        api.getProject(projectId).catch(() => null)
      ]);

      if (detail) {
        applyChatDetail(detail);
      }

      if (bundle) {
        setProjectBundle(bundle);
      }

      setNotice({
        tone: "info",
        message: successMessage
      });

      return detail;
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
      return null;
    } finally {
      setBusy((current) => ({ ...current, send: false }));
    }
  };

  const handleMessageSend = async (event: FormEvent) => {
    event.preventDefault();
    if (!chatDetail || !messageText.trim()) {
      return;
    }

    await submitMessageToChat(chatDetail.chat.id, chatDetail.project.id, messageText);
  };

  const persistExecutionProfile = async (nextPartial: { model?: string; reasoningEffort?: string }) => {
    if (!chatDetail) {
      return;
    }

    const projectId = chatDetail.project.id;
    const nextModel = trimOrEmpty(nextPartial.model) || selectedExecutionModel;
    const nextReasoningEffort = trimOrEmpty(nextPartial.reasoningEffort) || selectedReasoningEffort;
    const previousProfile = chatDetail.executionProfile;

    setBusy((current) => ({ ...current, profile: true }));
    setChatDetail((current) => {
      if (!current || current.project.id !== projectId) {
        return current;
      }

      return {
        ...current,
        executionProfile: {
          model: nextModel,
          reasoningEffort: nextReasoningEffort
        }
      };
    });

    try {
      const response = await api.updateExecutionProfile(projectId, {
        model: nextModel,
        reasoningEffort: nextReasoningEffort
      });

      setChatDetail((current) => {
        if (!current || current.project.id !== projectId) {
          return current;
        }

        return {
          ...current,
          executionProfile: response.executionProfile
        };
      });
      setNotice({
        tone: "info",
        message: `Saved execution profile for future turns: ${response.executionProfile.model ?? nextModel} · ${response.executionProfile.reasoningEffort ?? nextReasoningEffort}.`
      });
    } catch (error) {
      setChatDetail((current) => {
        if (!current || current.project.id !== projectId) {
          return current;
        }

        return {
          ...current,
          executionProfile: previousProfile
        };
      });
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusy((current) => ({ ...current, profile: false }));
    }
  };

  const handleCompactChat = async () => {
    if (!chatDetail) {
      return;
    }

    setBusy((current) => ({ ...current, compact: true }));

    try {
      const detail = await api.compactChat(chatDetail.chat.id);
      applyChatDetail(detail);

      const bundle = await api.getProject(detail.project.id).catch(() => null);
      if (bundle) {
        setProjectBundle(bundle);
      }

      setNotice({
        tone: "info",
        message: `Requested context compaction for ${detail.chat.title}.`
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    } finally {
      setBusy((current) => ({ ...current, compact: false }));
    }
  };

  const isTurnRunning = Boolean(runningTurnId);
  const composerStatus = chatDetail
    ? busy.compact
      ? "Compacting thread context..."
      : busy.send
        ? "Submitting message to Codex..."
      : isTurnRunning
        ? "Codex is thinking..."
        : latestStoppedTurn
          ? `Last turn ${describeStoppedTurnStatus(latestStoppedTurn.status)}`
        : `Last updated ${formatTime(chatDetail.thread.updatedAt)}`
    : "No thread selected";

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

  const focusComposer = () => {
    window.requestAnimationFrame(() => {
      composerInputRef.current?.focus();
    });
  };

  const closeBoardDialog = () => {
    setBoardDialog(null);
  };

  const handleOpenGoalDetails = () => {
    setBoardDialog({ kind: "goal" });
  };

  const handleOpenFeatureDetails = (featureId: string) => {
    setBoardDialog({ kind: "feature", featureId });
  };

  const handleOpenFeatureCoordination = (featureId: string) => {
    setBoardDialog({ kind: "coordination", featureId });
  };

  const handleOpenHistory = () => {
    setBoardDialog({ kind: "history" });
  };

  const handleOpenFeatureChat = async (feature: CoordexPlanFeature) => {
    if (!selectedProjectId) {
      return;
    }

    const roleName = feature.ownerRole.trim();
    if (!roleName) {
      setNotice({
        tone: "error",
        message: "Assign one implementation role before opening this subfunction."
      });
      return;
    }

    const targetChat =
      chats.find((chat) => chat.kind === "agent" && normalizeRoleName(chat.roleName) === normalizeRoleName(roleName)) ?? null;
    if (!targetChat) {
      setNotice({
        tone: "error",
        message: `Create and initialize the ${roleName} agent before executing this subfunction.`
      });
      return;
    }

    try {
      if (
        targetChat.id !== selectedChatId &&
        messageText.trim() &&
        !window.confirm(`This will clear the current unsent composer text and immediately start ${feature.title || feature.id} with ${roleName}. Continue?`)
      ) {
        focusComposer();
        return;
      }

      if (targetChat.id !== selectedChatId) {
        setMessageText("");
      }

      const execution = await api.executeFeature(selectedProjectId, feature.id);
      setProjectBoard(execution.board);
      setBoardDirty(false);
      setRunningTurnId(execution.turnId);
      setDraftAssistantText("");
      closeBoardDialog();
      await loadChat(execution.chat.id, execution.chat.projectId);
      setNotice({
        tone: "info",
        message: `Started ${feature.title || feature.id} with ${roleName}. Coordex will auto-route in-scope coordination until completion or failure.`
      });
    } catch (error) {
      setNotice({
        tone: "error",
        message: error instanceof Error ? error.message : String(error)
      });
    }
  };

  const timeline = useMemo(() => {
    if (!chatDetail) {
      return [];
    }

    return chatDetail.thread.turns.flatMap((turn) => turn.items.map((item) => ({ turnId: turn.id, item })));
  }, [chatDetail]);

  const handleThreadCardKeyDown = (
    event: React.KeyboardEvent<HTMLElement>,
    chatId: string,
    projectId: string
  ) => {
    if (event.key !== "Enter" && event.key !== " ") {
      return;
    }

    event.preventDefault();
    void loadChat(chatId, projectId);
  };

  if (busy.boot) {
    return <main className="loading-screen">Loading Coordex...</main>;
  }

  return (
    <main
      ref={appShellRef}
      className="app-shell"
      data-layout-refresh={layoutRefreshNonce}
      style={
        {
          "--sidebar-width": `${sidebarWidth}px`
        } as CSSProperties
      }
    >
      <aside className="sidebar-shell">
        <header className="sidebar-header">
          <div className="sidebar-brand">
            <div className="sidebar-title-row">
              <h1>Coordex</h1>
              <button
                className={`title-auth-button ${auth?.status === "authenticated" ? "title-auth-button-active" : ""}`}
                type="button"
                onClick={() => void handleLoginStart()}
                disabled={busy.login || auth?.status === "authenticated"}
                aria-label={auth?.status === "authenticated" ? "Authenticated" : "Login"}
                title={auth?.status === "authenticated" ? "Authenticated" : "Start ChatGPT login"}
              >
                {busy.login ? "opening" : auth?.status === "authenticated" ? "authenticated" : "login"}
              </button>
            </div>
            <p className="sidebar-copy">Visible project coordination over Codex threads.</p>
          </div>
        </header>

        {projectFormOpen ? (
          <form className="sidebar-form" onSubmit={handleProjectSubmit}>
            <label>
              <span>Name</span>
              <input value={projectName} onChange={(event) => setProjectName(event.target.value)} placeholder="Coordex" />
            </label>
            <label>
              <span>Root path</span>
              <input
                value={projectRootPath}
                onChange={(event) => setProjectRootPath(event.target.value)}
                placeholder="/Users/mawei/MyWork/coordex"
              />
            </label>
            <div className="inline-actions">
              <button className="primary-button" disabled={busy.project}>
                {busy.project ? "Saving..." : isEditingProject ? "Save Project" : "Create Project"}
              </button>
              <button className="ghost-button" type="button" onClick={closeProjectForm}>
                Cancel
              </button>
            </div>
          </form>
        ) : null}

        <section className="project-switcher">
          <div className="panel-header">
            <strong>Project</strong>
            <button
              className="panel-add-button"
              type="button"
              onClick={() => (projectFormOpen ? closeProjectForm() : openProjectCreateForm())}
              aria-label={projectFormOpen ? "Close project form" : "Create project"}
              title={projectFormOpen ? "Close project form" : "Create project"}
            >
              <IconPlus />
            </button>
          </div>

          <select
            value={selectedProjectId ?? ""}
            onChange={(event) => void handleProjectChange(event.target.value)}
            disabled={!projects.length}
            aria-label="Select project"
          >
            {projects.length ? (
              projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))
            ) : (
              <option value="">No project registered</option>
            )}
          </select>

          <div className="project-toolbar-icons">
            <button
              className="panel-icon-button"
              type="button"
              onClick={() => selectedProjectId && void loadProject(selectedProjectId, false, { includeBoard: false })}
              disabled={!selectedProjectId || busy.project}
              aria-label="Refresh project threads"
              title="Refresh project threads"
            >
              <IconRefresh />
            </button>
            <button
              className="panel-icon-button"
              type="button"
              onClick={openProjectEditForm}
              disabled={!selectedProjectId || busy.project}
              aria-label="Edit project"
              title="Edit project"
            >
              <IconEdit />
            </button>
            <button
              className={`panel-icon-button ${sidebarComposerMode === "chat" ? "panel-icon-button-accent" : ""}`}
              type="button"
              onClick={() => void toggleSidebarComposer("chat")}
              disabled={!selectedProjectId || busy.chat}
              aria-label="Create root chat"
              title="Create root chat"
            >
              <IconChat />
            </button>
            <button
              className={`panel-icon-button ${sidebarComposerMode === "agent" ? "panel-icon-button-accent" : ""}`}
              type="button"
              onClick={() => void toggleSidebarComposer("agent")}
              disabled={!selectedProjectId || busy.agent}
              aria-label="Open agent setup"
              title="Open agent setup"
            >
              <IconAgent />
            </button>
            <button
              className="panel-icon-button panel-icon-button-danger"
              type="button"
              onClick={() => void handleProjectDelete()}
              disabled={!selectedProjectId || busy.project}
              aria-label="Remove project"
              title="Remove project"
            >
              <IconRemove />
            </button>
          </div>
        </section>

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
              <strong>Agent Setup</strong>
              <button className="ghost-link" type="button" onClick={closeSidebarComposer}>
                Cancel
              </button>
            </div>

            <div className="agent-setup-tabs" role="tablist" aria-label="Agent setup mode">
              <button
                className={`agent-setup-tab ${agentSetupTab === "template" ? "agent-setup-tab-active" : ""}`}
                type="button"
                role="tab"
                aria-selected={agentSetupTab === "template"}
                onClick={() => setAgentSetupTab("template")}
              >
                Template
              </button>
              <button
                className={`agent-setup-tab ${agentSetupTab === "custom" ? "agent-setup-tab-active" : ""}`}
                type="button"
                role="tab"
                aria-selected={agentSetupTab === "custom"}
                onClick={() => setAgentSetupTab("custom")}
              >
                Custom
              </button>
            </div>

            {agentSetupTab === "template" ? (
              <>
                <label>
                  <span>Template</span>
                  <select value={agentProjectTemplateKey} onChange={(event) => setAgentProjectTemplateKey(event.target.value)}>
                    {agentProjectTemplates.map((template) => (
                      <option key={template.key} value={template.key}>
                        {template.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="sidebar-subsection">
                  <div className="sidebar-subsection-header">
                    <strong>Template Roles</strong>
                    <span className="muted">{selectedTemplateRoleKeys.length} selected</span>
                  </div>

                  <div className="template-role-list">
                    {templateRoleRows.map((role) => (
                      <label
                        key={role.key}
                        className={`template-role-row ${role.exists ? "template-role-row-existing" : ""}`}
                        title={role.description}
                      >
                        <input
                          type="checkbox"
                          checked={role.exists ? true : selectedTemplateRoleKeys.includes(role.key)}
                          onChange={() => handleTemplateRoleToggle(role.key)}
                          disabled={role.exists || busy.agent}
                        />
                        <div className="template-role-meta">
                          <strong>{role.label}</strong>
                        </div>
                        <span className={`template-role-badge ${role.exists ? "template-role-badge-existing" : ""}`}>
                          {role.exists ? "Exists" : "Ready"}
                        </span>
                      </label>
                    ))}
                  </div>

                  <div className="sidebar-inline-actions">
                    <button className="ghost-button" type="button" onClick={handleSelectAllTemplateRoles} disabled={busy.agent}>
                      All
                    </button>
                    <button className="ghost-button" type="button" onClick={handleClearTemplateRoles} disabled={busy.agent}>
                      None
                    </button>
                    <button
                      className="primary-button"
                      type="button"
                      onClick={() => void handleTemplateAgentCreate()}
                      disabled={busy.agent || !selectedTemplateRoleKeys.length}
                    >
                      {busy.agent ? "Creating..." : "Create Selected"}
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <form className="sidebar-subsection agent-custom-form" onSubmit={handleCustomAgentCreate}>
                <label>
                  <span>Role name</span>
                  <input
                    value={customRoleName}
                    onChange={(event) => setCustomRoleName(event.target.value)}
                    placeholder="producer"
                  />
                </label>
                <label>
                  <span>Responsibility</span>
                  <textarea
                    value={customRolePurpose}
                    onChange={(event) => setCustomRolePurpose(event.target.value)}
                    placeholder="Own release coordination, cross-role timing, and final acceptance prep."
                  />
                </label>
                <button className="secondary-button" disabled={busy.agent || !customRoleName.trim()}>
                  {busy.agent ? "Creating..." : "Create Custom Agent"}
                </button>
              </form>
            )}
          </section>
        ) : null}

        {notice ? <div className={`notice notice-${notice.tone}`}>{notice.message}</div> : null}

        <div className="thread-list-panel">
          <div className="thread-list-header">
            <p className="eyebrow">Threads</p>
          </div>

          <div className="thread-tree">
            {selectedProject ? (
              chats.length ? (
                chats.map((chat) => {
                  const responsibility = describeChatResponsibility(chat, agentProjectTemplates);
                  const showResponsibilityDetails = needsThreadResponsibilityDetails(responsibility);

                  return (
                    <article
                      key={chat.id}
                      className={`thread-link ${chat.id === selectedChatId ? "selected" : ""}`}
                      role="button"
                      tabIndex={0}
                      aria-pressed={chat.id === selectedChatId}
                      onClick={() => void loadChat(chat.id, chat.projectId)}
                      onKeyDown={(event) => handleThreadCardKeyDown(event, chat.id, chat.projectId)}
                    >
                      <div className="thread-link-row">
                        <strong title={chat.title}>{chat.title}</strong>
                        <div className="thread-link-badges">
                          {isPendingAgent(chat) ? <span className="pill pill-state-pending">not started</span> : null}
                          <span className={`pill pill-kind-${chat.kind}`}>{chat.kind}</span>
                        </div>
                      </div>

                      <div className="thread-link-meta">
                        <span className="thread-link-responsibility" title={showResponsibilityDetails ? undefined : responsibility}>
                          {responsibility}
                        </span>
                        {showResponsibilityDetails ? (
                          <div className="board-hover-anchor thread-link-detail-anchor">
                            <button
                              className="thread-link-detail-button"
                              type="button"
                              aria-label={`Open full responsibility for ${chat.title}`}
                              title="Open full responsibility"
                              onClick={(event) => {
                                event.stopPropagation();
                              }}
                              onKeyDown={(event) => {
                                event.stopPropagation();
                              }}
                            >
                              <IconEllipsis />
                            </button>
                            {renderThreadResponsibilityPreviewCard(chat, responsibility)}
                          </div>
                        ) : null}
                      </div>
                    </article>
                  );
                })
              ) : (
                <p className="empty-note">No chats yet. Use the fixed toolbar above to create one.</p>
              )
            ) : (
              <p className="empty-note">Create or select a project first.</p>
            )}
          </div>
        </div>

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
        {selectedProject ? (
          <section className="board-shell">
            {projectBoard && activePlan ? (
              <>
                <div className="board-topbar">
                  <div className="board-goal-row board-goal-card">
                    <span className="board-row-label">Goal</span>
                    <span className="board-goal-text" title={activePlan.goal || "No goal recorded yet."}>
                      {activePlan.goal || "No goal recorded yet."}
                    </span>
                    <div className="board-hover-anchor">
                      <button
                        className="board-row-icon-button"
                        type="button"
                        onClick={handleOpenGoalDetails}
                        aria-label="Open full goal"
                        title="Open full goal"
                      >
                        <IconEllipsis />
                      </button>
                      {renderGoalPreviewCard(activePlan.goal)}
                    </div>
                  </div>

                  <button
                    className="board-history-button board-history-button-standalone"
                    type="button"
                    onClick={handleOpenHistory}
                    aria-label="Open history"
                    title="Open history"
                  >
                    <IconHistory />
                    <span>History</span>
                  </button>
                </div>

                {activePlan.features.length ? (
                  <div className="board-feature-list">
                    {activePlan.features.map((feature) => (
                      <article
                        key={feature.id}
                        className={[
                          "board-feature-row",
                          feature.done ? "board-feature-row-done" : "",
                          feature.runState === "running" ? "board-feature-row-running" : "",
                          feature.runState === "blocked" ? "board-feature-row-blocked" : ""
                        ]
                          .filter(Boolean)
                          .join(" ")}
                      >
                        <span
                          className={[
                            "board-feature-state",
                            feature.done
                              ? "board-feature-state-done"
                              : feature.runState === "running"
                                ? "board-feature-state-running"
                                : feature.runState === "blocked"
                                  ? "board-feature-state-blocked"
                                  : "board-feature-state-open"
                          ].join(" ")}
                          title={describeFeatureState(feature)}
                        >
                          {feature.done ? (
                            <IconCheckCircle />
                          ) : feature.runState === "running" ? (
                            <span>R</span>
                          ) : feature.runState === "blocked" ? (
                            <span>!</span>
                          ) : (
                            <span>{feature.ownerRole.trim().slice(0, 1).toUpperCase() || "?"}</span>
                          )}
                        </span>

                        <span
                          className="board-feature-text"
                          title={`${describeFeatureState(feature)} · ${buildFeatureSummary(feature)}`}
                        >
                          {buildFeatureSummary(feature)}
                        </span>

                        <div className="board-hover-anchor">
                          <button
                            className="board-row-icon-button"
                            type="button"
                            onClick={() => handleOpenFeatureCoordination(feature.id)}
                            aria-label="Open subfunction coordination"
                            title="Open subfunction coordination"
                          >
                            <IconChat />
                          </button>
                          {renderCoordinationPreviewCard(feature)}
                        </div>

                        <div className="board-hover-anchor">
                          <button
                            className="board-row-icon-button"
                            type="button"
                            onClick={() => handleOpenFeatureDetails(feature.id)}
                            aria-label="Open subfunction details"
                            title="Open subfunction details"
                          >
                            <IconEllipsis />
                          </button>
                          {renderFeaturePreviewCard(feature)}
                        </div>

                        {!feature.done ? (
                          <button
                            className="board-row-icon-button board-row-icon-button-accent"
                            type="button"
                            onClick={() => void handleOpenFeatureChat(feature)}
                            disabled={!feature.ownerRole.trim() || feature.runState === "running" || busy.agent || busy.chat || busy.send}
                            aria-label={
                              feature.runState === "running"
                                ? `${feature.title || feature.id} is already running`
                                : `Execute with ${feature.ownerRole || "assigned role"}`
                            }
                            title={
                              feature.runState === "running"
                                ? "This subfunction is already running."
                                : feature.ownerRole.trim()
                                  ? `Execute with ${feature.ownerRole}`
                                  : "Assign a role first"
                            }
                          >
                            <IconLaunch />
                          </button>
                        ) : null}
                      </article>
                    ))}
                  </div>
                ) : (
                  <div className="empty-thread board-empty">
                    <h3>No subfunctions yet</h3>
                    <p>Current goal is loaded, but no single-role subfunctions are recorded yet.</p>
                  </div>
                )}
              </>
            ) : (
              <div className="empty-thread board-empty">
                <h3>Loading current plan</h3>
                <p>Coordex is reading this project's local board data.</p>
              </div>
            )}
          </section>
        ) : null}

        <div className="thread-scroll" ref={threadScrollRef}>
          {chatDetail ? (
            timeline.length || draftAssistantText || isTurnRunning ? (
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
                {isTurnRunning && !draftAssistantText ? (
                  <article className="message-card message-assistant live message-assistant-thinking">
                    <header>
                      <span>Codex</span>
                      <small>{runningTurnId?.slice(0, 8) ?? "live"}</small>
                    </header>
                    <pre>Thinking…</pre>
                  </article>
                ) : null}
                {draftAssistantText ? (
                  <article className="message-card message-assistant live">
                    <header>
                      <span>Codex</span>
                      <small>{runningTurnId?.slice(0, 8) ?? "live"}</small>
                    </header>
                    <pre>{draftAssistantText}</pre>
                  </article>
                ) : null}
                {latestStoppedTurn ? (
                  <article className="message-card message-system">
                    <header>
                      <span>Coordex</span>
                      <small>{latestStoppedTurn.id.slice(0, 8)}</small>
                    </header>
                    <pre>{`The latest turn ${describeStoppedTurnStatus(latestStoppedTurn.status)}. This thread is no longer running.`}</pre>
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
              ref={composerInputRef}
              value={messageText}
              onChange={(event) => setMessageText(event.target.value)}
              placeholder="Send a structured instruction into the selected Codex thread..."
              disabled={!chatDetail || busy.send || busy.compact}
            />
            <div className="composer-row">
              <span className={`muted ${isTurnRunning ? "composer-status-running" : ""}`}>{composerStatus}</span>
              <div className="composer-actions">
                <span className="composer-profile-chip" title={getContextWindowUsageTitle(chatDetail)}>
                  {formatContextWindowUsage(chatDetail)}
                </span>
                <div
                  className="composer-profile-controls"
                  title="Writes the selected project profile to .codex/config.toml. Future thread starts and turns use this model and reasoning effort."
                >
                  <select
                    className="composer-profile-select"
                    aria-label="Model"
                    value={selectedExecutionModel}
                    onChange={(event) => void persistExecutionProfile({ model: event.target.value })}
                    disabled={!chatDetail || busy.profile}
                  >
                    {availableExecutionModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                  <select
                    className="composer-profile-select"
                    aria-label="Reasoning effort"
                    value={selectedReasoningEffort}
                    onChange={(event) => void persistExecutionProfile({ reasoningEffort: event.target.value })}
                    disabled={!chatDetail || busy.profile}
                  >
                    {availableReasoningEfforts.map((effort) => (
                      <option key={effort} value={effort}>
                        {effort}
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  className="secondary-button composer-compact-button"
                  type="button"
                  onClick={() => void handleCompactChat()}
                  disabled={!chatDetail || busy.send || busy.compact || isTurnRunning}
                  title={isTurnRunning ? "Wait for the current turn to finish before compacting." : "Compact current thread context"}
                >
                  <IconCompact />
                  <span>{busy.compact ? "Compacting..." : "Compact"}</span>
                </button>
                <button className="primary-button" disabled={!chatDetail || busy.send || busy.compact || !messageText.trim()}>
                  {busy.send ? "Sending..." : "Send"}
                </button>
              </div>
            </div>
          </form>
        </footer>

        {boardDialog && activePlan ? (
          <div className="board-modal-backdrop" role="presentation" onClick={closeBoardDialog}>
            <section
              className="board-modal"
              role="dialog"
              aria-modal="true"
              aria-label={
                boardDialog.kind === "goal"
                  ? "Current goal"
                  : boardDialog.kind === "feature"
                    ? "Subfunction details"
                    : boardDialog.kind === "coordination"
                      ? "Subfunction coordination"
                      : "History"
              }
              onClick={(event) => event.stopPropagation()}
            >
              <header className="board-modal-header">
                <strong>
                  {boardDialog.kind === "goal"
                    ? "Current Goal"
                    : boardDialog.kind === "feature"
                      ? "Subfunction"
                      : boardDialog.kind === "coordination"
                        ? "Coordination Log"
                        : "Plan History"}
                </strong>
                <button className="ghost-button" type="button" onClick={closeBoardDialog}>
                  Close
                </button>
              </header>

              {boardDialog.kind === "goal" ? (
                <div className="board-modal-body">
                  <p>{activePlan.goal || "No goal recorded yet."}</p>
                </div>
              ) : null}

              {boardDialog.kind === "feature" ? (
                activeBoardDialogFeature ? (
                  <div className="board-modal-body">
                    <div className="board-modal-meta">
                      <span className={`pill ${activeBoardDialogFeature.done ? "pill-kind-chat" : "pill-kind-agent"}`}>
                        {describeFeatureState(activeBoardDialogFeature).toLowerCase()}
                      </span>
                      <span className="pill pill-kind-chat">{activeBoardDialogFeature.ownerRole || "unassigned"}</span>
                      <span className="muted">Updated {formatTime(activeBoardDialogFeature.updatedAt)}</span>
                    </div>

                    <h3>{activeBoardDialogFeature.title || "Untitled subfunction"}</h3>
                    <div className="board-modal-section">
                      <span className="board-conversation-role">Description</span>
                      <p>{activeBoardDialogFeature.description || "No detailed description recorded for this subfunction."}</p>
                    </div>

                    {!activeBoardDialogFeature.done ? (
                      <div className="board-modal-actions">
                        <button
                          className="secondary-button"
                          type="button"
                          onClick={() => void handleOpenFeatureChat(activeBoardDialogFeature)}
                          disabled={
                            !activeBoardDialogFeature.ownerRole.trim() ||
                            activeBoardDialogFeature.runState === "running" ||
                            busy.agent ||
                            busy.chat ||
                            busy.send
                          }
                        >
                          {activeBoardDialogFeature.runState === "running"
                            ? "Already running"
                            : activeBoardDialogFeature.ownerRole.trim()
                            ? `Execute with ${activeBoardDialogFeature.ownerRole}`
                            : "Assign a role first"}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : (
                  <div className="board-modal-body">
                    <p>No subfunction detail is currently available for this row.</p>
                  </div>
                )
              ) : null}

              {boardDialog.kind === "coordination" ? (
                activeBoardDialogFeature ? (
                  <div className="board-modal-body board-modal-conversations">
                    <div className="board-modal-meta">
                      <span className="pill pill-kind-chat">{activeBoardDialogFeature.ownerRole || "unassigned"}</span>
                      <span className="muted">
                        {activeBoardDialogFeature.coordinations.length} coordination
                        {activeBoardDialogFeature.coordinations.length === 1 ? "" : "s"}
                      </span>
                    </div>

                    <h3>{activeBoardDialogFeature.title || "Untitled subfunction"}</h3>

                    {activeBoardDialogFeature.coordinations.length ? (
                      <div className="board-conversation-list">
                        {activeBoardDialogFeature.coordinations.map((coordination) => (
                          <article key={coordination.id} className="board-conversation-card">
                            <header>
                              <strong>{getCoordinationLabel(coordination)}</strong>
                              <small>{formatTime(coordination.updatedAt)}</small>
                            </header>

                            <div className="board-modal-meta">
                              <span className="pill pill-kind-agent">{formatCoordinationKind(coordination.kind)}</span>
                              <span className="pill pill-kind-chat">{formatCoordinationStatus(coordination.status)}</span>
                              <span className="muted">Created {formatTime(coordination.createdAt)}</span>
                            </div>

                            <div className="board-conversation-turns">
                              <div className="board-conversation-turn">
                                <span className="board-conversation-role">Summary</span>
                                <p>{coordination.summary || "No summary recorded."}</p>
                              </div>
                              <div className="board-conversation-turn">
                                <span className="board-conversation-role">Input</span>
                                <p>{coordination.input || "No structured input recorded."}</p>
                              </div>
                              <div className="board-conversation-turn">
                                <span className="board-conversation-role">Expected Output</span>
                                <p>{coordination.expectedOutput || "No expected output recorded."}</p>
                              </div>
                              <div className="board-conversation-turn">
                                <span className="board-conversation-role">Output</span>
                                <p>{coordination.output || "No output recorded yet."}</p>
                              </div>
                            </div>
                          </article>
                        ))}
                      </div>
                    ) : (
                      <p className="empty-note">No structured coordination record has been saved for this subfunction yet.</p>
                    )}
                  </div>
                ) : (
                  <div className="board-modal-body">
                    <p>No coordination record is currently available for this row.</p>
                  </div>
                )
              ) : null}

              {boardDialog.kind === "history" ? (
                <div className="board-modal-body">
                  {projectBoard.history.length ? (
                    <div className="board-history-list">
                      {projectBoard.history.map((plan) => (
                        <article key={plan.id} className="board-history-card">
                          <header>
                            <strong>{plan.goal || "No goal recorded."}</strong>
                            <small>{formatTime(plan.archivedAt ?? plan.updatedAt)}</small>
                          </header>
                          <div className="board-modal-meta">
                            <span className="pill pill-kind-chat">
                              {plan.features.filter((feature) => feature.done).length}/{plan.features.length} done
                            </span>
                            <span className="muted">Created {formatTime(plan.createdAt)}</span>
                          </div>
                        </article>
                      ))}
                    </div>
                  ) : (
                    <p className="empty-note">No archived plans yet.</p>
                  )}
                </div>
              ) : null}
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
