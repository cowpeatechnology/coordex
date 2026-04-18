import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { resolve } from "node:path";

import type {
  CoordexPlan,
  CoordexPlanCoordination,
  CoordexPlanFeature,
  CoordexPlanFeatureRunState,
  CoordexProjectBoard
} from "../shared/types.js";

const COORDEX_DIRNAME = ".coordex";
const BOARD_JSON_PATH = "project-board.json";
const CURRENT_PLAN_MD_PATH = "current-plan.md";
const PLAN_HISTORY_MD_PATH = "plan-history.md";
const WAITING_FOR_NEXT_REQUIREMENT_GOAL = "All recorded plans are complete. Waiting for the next requirement.";

const isoNow = (): string => new Date().toISOString();

type WriteBoardArtifactsOptions = {
  preserveCurrentPlanMarkdown?: boolean;
};

const ensureString = (value: unknown, fallback = ""): string => {
  return typeof value === "string" ? value : fallback;
};

const createEmptyPlan = (): CoordexPlan => {
  const now = isoNow();
  return {
    id: randomUUID(),
    goal: "",
    features: [],
    createdAt: now,
    updatedAt: now,
    archivedAt: null
  };
};

const createWaitingPlan = (): CoordexPlan => {
  const plan = createEmptyPlan();
  plan.goal = WAITING_FOR_NEXT_REQUIREMENT_GOAL;
  return plan;
};

const defaultBoard = (): CoordexProjectBoard => ({
  version: 4,
  activePlan: createEmptyPlan(),
  history: []
});

const normalizeCoordinationKind = (value: unknown): CoordexPlanCoordination["kind"] => {
  switch (value) {
    case "dispatch":
    case "question":
    case "blocker":
    case "handoff":
    case "result":
    case "decision":
      return value;
    default:
      return "question";
  }
};

const normalizeCoordinationStatus = (value: unknown): CoordexPlanCoordination["status"] => {
  switch (value) {
    case "open":
    case "answered":
    case "blocked":
    case "done":
      return value;
    default:
      return "open";
  }
};

const normalizeFeatureRunState = (value: unknown, done: boolean): CoordexPlanFeatureRunState => {
  if (done) {
    return "idle";
  }

  switch (value) {
    case "running":
    case "blocked":
      return value;
    default:
      return "idle";
  }
};

const normalizeCoordination = (input: unknown): CoordexPlanCoordination | null => {
  if (!input || typeof input !== "object") {
    return null;
  }

  const source = input as Partial<CoordexPlanCoordination>;
  return {
    id: typeof source.id === "string" && source.id ? source.id : randomUUID(),
    fromRole: ensureString(source.fromRole).trim(),
    toRole: ensureString(source.toRole).trim(),
    kind: normalizeCoordinationKind(source.kind),
    summary: ensureString(source.summary).trim(),
    input: ensureString(source.input).trim(),
    expectedOutput: ensureString(source.expectedOutput).trim(),
    output: ensureString(source.output).trim(),
    status: normalizeCoordinationStatus(source.status),
    createdAt: typeof source.createdAt === "string" ? source.createdAt : isoNow(),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : isoNow()
  };
};

const normalizeFeature = (input: unknown): CoordexPlanFeature | null => {
  if (!input || typeof input !== "object") {
    return null;
  }

  const source = input as Partial<CoordexPlanFeature>;
  const coordinations = Array.isArray(source.coordinations)
    ? source.coordinations
        .map(normalizeCoordination)
        .filter((value): value is CoordexPlanCoordination => Boolean(value))
    : [];

  return {
    id: typeof source.id === "string" && source.id ? source.id : randomUUID(),
    title: ensureString(source.title).trim(),
    description: ensureString(source.description).trim(),
    ownerRole: ensureString(source.ownerRole).trim(),
    done: Boolean(source.done),
    runState: normalizeFeatureRunState(source.runState, Boolean(source.done)),
    coordinations,
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : isoNow()
  };
};

const normalizePlan = (input: unknown): CoordexPlan => {
  if (!input || typeof input !== "object") {
    return createEmptyPlan();
  }

  const source = input as Partial<CoordexPlan>;
  const features = Array.isArray(source.features)
    ? source.features.map(normalizeFeature).filter((value): value is CoordexPlanFeature => Boolean(value))
    : [];

  return {
    id: typeof source.id === "string" && source.id ? source.id : randomUUID(),
    goal: ensureString(source.goal).trim(),
    features,
    createdAt: typeof source.createdAt === "string" ? source.createdAt : isoNow(),
    updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : isoNow(),
    archivedAt: typeof source.archivedAt === "string" ? source.archivedAt : null
  };
};

const normalizeBoard = (input: unknown): CoordexProjectBoard => {
  if (!input || typeof input !== "object") {
    return defaultBoard();
  }

  const source = input as Partial<CoordexProjectBoard> & { version?: unknown };
  if (source.version !== 4) {
    return defaultBoard();
  }

  return {
    version: 4,
    activePlan: normalizePlan(source.activePlan),
    history: Array.isArray(source.history) ? source.history.map(normalizePlan) : []
  };
};

const getCoordexPaths = (projectRoot: string) => {
  const coordexDir = resolve(projectRoot, COORDEX_DIRNAME);
  return {
    coordexDir,
    boardJsonPath: resolve(coordexDir, BOARD_JSON_PATH),
    currentPlanMarkdownPath: resolve(coordexDir, CURRENT_PLAN_MD_PATH),
    planHistoryMarkdownPath: resolve(coordexDir, PLAN_HISTORY_MD_PATH)
  };
};

const getFileModifiedAtMs = (filePath: string): number | null => {
  try {
    return statSync(filePath).mtimeMs;
  } catch {
    return null;
  }
};

const escapeRegex = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const stripWrappingTicks = (value: string): string => value.replace(/^`+|`+$/g, "").trim();

const slugify = (value: string): string => {
  const normalized = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "item";
};

const parsePlanTimestamp = (markdown: string, label: "Created" | "Updated"): string | null => {
  const match = markdown.match(new RegExp(`\\*\\*${label}\\*\\*:\\s*\`([^\\\`]+)\``, "i"));
  return match?.[1]?.trim() || null;
};

const parsePlanGoal = (markdown: string): string => {
  const match = markdown.match(/## Goal\s+([\s\S]*?)(?:\n## Subfunctions|\s*$)/i);
  if (!match) {
    return "";
  }

  const goal = match[1].trim();
  return goal === "_No goal yet._" ? "" : goal;
};

const parseCheckboxFeatures = (
  section: string,
  updatedAt: string,
  fallbackFeaturesById: Map<string, CoordexPlanFeature>
): CoordexPlanFeature[] => {
  const features: CoordexPlanFeature[] = [];
  let index = 0;
  const lines = section.split(/\r?\n/);
  let current:
    | {
        done: boolean;
        title: string;
        ownerRole: string;
        bodyLines: string[];
      }
    | null = null;

  const pushCurrent = (): void => {
    if (!current) {
      return;
    }

    index += 1;
    const descriptionMatch = current.bodyLines.join("\n").match(/^\s+- Description:\s*(.+)$/m);
    const description = (descriptionMatch?.[1] ?? "").trim();
    const featureId = `feature-${index}-${slugify(current.title || current.ownerRole || String(index))}`;
    const fallbackFeature = fallbackFeaturesById.get(featureId);

    features.push({
      id: featureId,
      title: current.title,
      description,
      ownerRole: current.ownerRole,
      done: current.done,
      runState: current.done ? "idle" : fallbackFeature?.runState ?? "idle",
      coordinations: fallbackFeature?.coordinations ?? [],
      updatedAt
    });
  };

  for (const line of lines) {
    const featureMatch = line.match(/^- \[([ xX])\] (.+?)(?: \(`([^`]+)`\))?\s*$/);
    if (featureMatch) {
      pushCurrent();
      current = {
        done: featureMatch[1].toLowerCase() === "x",
        title: (featureMatch[2] ?? "").trim(),
        ownerRole: (featureMatch[3] ?? "").trim(),
        bodyLines: []
      };
      continue;
    }

    if (current) {
      current.bodyLines.push(line);
    }
  }

  pushCurrent();
  return features;
};

const parseDetailedFeatures = (
  section: string,
  updatedAt: string,
  fallbackFeaturesById: Map<string, CoordexPlanFeature>
): CoordexPlanFeature[] => {
  const featureMatches = section.matchAll(/(?:^|\n)###\s+([^\n]+)\n([\s\S]*?)(?=(?:\n###\s+)|\s*$)/g);
  const features: CoordexPlanFeature[] = [];

  for (const match of featureMatches) {
    const heading = (match[1] ?? "").trim();
    const body = match[2] ?? "";
    const lines = body.split(/\r?\n/);
    let ownerRole = "";
    let status = "";
    let objective = "";
    let currentSectionLabel: string | null = null;
    const descriptionLines: string[] = heading ? [`Task ID: ${heading}`] : [];

    for (const rawLine of lines) {
      const trimmed = rawLine.trim();
      if (!trimmed) {
        continue;
      }

      if (/^\s{2,}- /.test(rawLine) && currentSectionLabel) {
        descriptionLines.push(`- ${trimmed.replace(/^- /, "").trim()}`);
        continue;
      }

      const fieldMatch = trimmed.match(/^- ([A-Za-z][A-Za-z ]+):\s*(.*)$/);
      if (!fieldMatch) {
        currentSectionLabel = null;
        descriptionLines.push(trimmed.replace(/^- /, "").trim());
        continue;
      }

      const label = fieldMatch[1].trim();
      const value = fieldMatch[2].trim();
      switch (label.toLowerCase()) {
        case "owner":
          ownerRole = stripWrappingTicks(value);
          currentSectionLabel = null;
          break;
        case "status":
          status = stripWrappingTicks(value).toLowerCase();
          currentSectionLabel = null;
          break;
        case "objective":
          objective = value;
          descriptionLines.push(`Objective: ${value}`);
          currentSectionLabel = null;
          break;
        default:
          if (value) {
            descriptionLines.push(`${label}: ${value}`);
            currentSectionLabel = null;
          } else {
            descriptionLines.push(`${label}:`);
            currentSectionLabel = label;
          }
          break;
      }
    }

    const title = objective || heading || "Untitled subfunction";
    const featureId = heading || `feature-${slugify(title)}`;
    const fallbackFeature = fallbackFeaturesById.get(featureId);
    features.push({
      id: featureId,
      title,
      description: descriptionLines.join("\n").trim(),
      ownerRole,
      done: status === "done" || status === "completed" || status === "complete",
      runState:
        status === "done" || status === "completed" || status === "complete"
          ? "idle"
          : fallbackFeature?.runState ?? "idle",
      coordinations: fallbackFeature?.coordinations ?? [],
      updatedAt
    });
  }

  return features;
};

const parseCurrentPlanMarkdown = (markdown: string, fallbackPlan: CoordexPlan): CoordexPlan | null => {
  const normalizedMarkdown = markdown.trim();
  if (!normalizedMarkdown) {
    return null;
  }

  const createdAt = parsePlanTimestamp(normalizedMarkdown, "Created") ?? fallbackPlan.createdAt ?? isoNow();
  const updatedAt = parsePlanTimestamp(normalizedMarkdown, "Updated") ?? isoNow();
  const goal = parsePlanGoal(normalizedMarkdown);
  const subfunctionsMatch = normalizedMarkdown.match(/## Subfunctions\s+([\s\S]*)$/i);
  const subfunctionsSection = (subfunctionsMatch?.[1] ?? "").trim();
  const fallbackFeaturesById = new Map(fallbackPlan.features.map((feature) => [feature.id, feature]));

  let features: CoordexPlanFeature[] = [];
  if (subfunctionsSection && subfunctionsSection !== "_No subfunctions yet._") {
    if (/^###\s+/m.test(subfunctionsSection)) {
      features = parseDetailedFeatures(subfunctionsSection, updatedAt, fallbackFeaturesById);
    } else if (/- \[[ xX]\] /.test(subfunctionsSection)) {
      features = parseCheckboxFeatures(subfunctionsSection, updatedAt, fallbackFeaturesById);
    }
  }

  return {
    id: fallbackPlan.id,
    goal,
    features,
    createdAt,
    updatedAt,
    archivedAt: null
  };
};

const renderCoordination = (coordination: CoordexPlanCoordination): string => {
  const route = `${coordination.fromRole || "role"} -> ${coordination.toRole || "role"}`;
  const lines = [`  - ${route} [${coordination.kind}/${coordination.status}]`];

  if (coordination.summary) {
    lines.push(`    - Summary: ${coordination.summary}`);
  }
  if (coordination.input) {
    lines.push(`    - Input: ${coordination.input}`);
  }
  if (coordination.expectedOutput) {
    lines.push(`    - Expected Output: ${coordination.expectedOutput}`);
  }
  if (coordination.output) {
    lines.push(`    - Output: ${coordination.output}`);
  }
  return lines.join("\n");
};

const renderFeature = (feature: CoordexPlanFeature): string => {
  const checkbox = feature.done ? "x" : " ";
  const owner = feature.ownerRole ? ` (\`${feature.ownerRole}\`)` : "";
  const lines = [`- [${checkbox}] ${feature.title || "Untitled subfunction"}${owner}`];

  if (feature.description) {
    lines.push(`  - Description: ${feature.description}`);
  }

  if (feature.coordinations.length) {
    lines.push("  - Coordination:");
    for (const coordination of feature.coordinations) {
      lines.push(renderCoordination(coordination));
    }
  }

  return lines.join("\n");
};

const renderPlanMarkdown = (plan: CoordexPlan): string => {
  const lines = [
    "# Current Plan",
    "",
    `**Created**: \`${plan.createdAt}\`  `,
    `**Updated**: \`${plan.updatedAt}\``,
    "",
    "## Goal",
    "",
    plan.goal || "_No goal yet._",
    "",
    "## Subfunctions",
    ""
  ];

  if (!plan.features.length) {
    lines.push("_No subfunctions yet._");
    return lines.join("\n");
  }

  for (const feature of plan.features) {
    lines.push(renderFeature(feature));
  }

  return lines.join("\n");
};

const renderHistoryMarkdown = (history: CoordexPlan[]): string => {
  const lines = ["# Plan History", ""];

  if (!history.length) {
    lines.push("_No archived plans yet._");
    return lines.join("\n");
  }

  for (const plan of history) {
    const doneCount = plan.features.filter((feature) => feature.done).length;
    lines.push(`## Archived ${plan.archivedAt ?? plan.updatedAt}`);
    lines.push("");
    lines.push(`- Goal: ${plan.goal || "_No goal recorded._"}`);
    lines.push(`- Created: \`${plan.createdAt}\``);
    lines.push(`- Archived: \`${plan.archivedAt ?? "—"}\``);
    lines.push(`- Subfunctions: ${doneCount}/${plan.features.length} done`);
    lines.push("");
  }

  return lines.join("\n").trimEnd();
};

const writeBoardArtifacts = (
  projectRoot: string,
  board: CoordexProjectBoard,
  options: WriteBoardArtifactsOptions = {}
): CoordexProjectBoard => {
  const normalizedBoard = normalizeBoard(board);
  const paths = getCoordexPaths(projectRoot);
  mkdirSync(paths.coordexDir, { recursive: true });

  if (!options.preserveCurrentPlanMarkdown) {
    writeFileSync(paths.currentPlanMarkdownPath, `${renderPlanMarkdown(normalizedBoard.activePlan)}\n`, "utf8");
  }
  writeFileSync(paths.planHistoryMarkdownPath, `${renderHistoryMarkdown(normalizedBoard.history)}\n`, "utf8");
  writeFileSync(paths.boardJsonPath, JSON.stringify(normalizedBoard, null, 2), "utf8");

  return normalizedBoard;
};

const finalizeCompletedActivePlan = (
  board: CoordexProjectBoard
): { board: CoordexProjectBoard; rolled: boolean } => {
  const activePlan = board.activePlan;
  if (activePlan.archivedAt || !activePlan.features.length || activePlan.features.some((feature) => !feature.done)) {
    return { board, rolled: false };
  }

  const archivedAt = isoNow();
  const archivedPlan: CoordexPlan = {
    ...activePlan,
    updatedAt: archivedAt,
    archivedAt
  };

  const waitingPlan = createWaitingPlan();
  waitingPlan.createdAt = archivedAt;
  waitingPlan.updatedAt = archivedAt;

  return {
    rolled: true,
    board: {
      version: 4,
      activePlan: waitingPlan,
      history: [archivedPlan, ...board.history]
    }
  };
};

export function loadProjectBoard(projectRoot: string): CoordexProjectBoard {
  const paths = getCoordexPaths(projectRoot);
  const markdownExists = existsSync(paths.currentPlanMarkdownPath);
  const boardJsonExists = existsSync(paths.boardJsonPath);

  let board = defaultBoard();
  if (boardJsonExists) {
    try {
      const raw = readFileSync(paths.boardJsonPath, "utf8");
      board = normalizeBoard(JSON.parse(raw) as unknown);
    } catch {
      board = defaultBoard();
    }
  }

  const markdownModifiedAtMs = markdownExists ? getFileModifiedAtMs(paths.currentPlanMarkdownPath) : null;
  const boardModifiedAtMs = boardJsonExists ? getFileModifiedAtMs(paths.boardJsonPath) : null;
  const shouldSyncFromMarkdown =
    markdownExists && (boardModifiedAtMs === null || (markdownModifiedAtMs ?? 0) > boardModifiedAtMs);

  if (shouldSyncFromMarkdown) {
    try {
      const markdown = readFileSync(paths.currentPlanMarkdownPath, "utf8");
      const parsedPlan = parseCurrentPlanMarkdown(markdown, board.activePlan);
      if (parsedPlan) {
        const nextBoard = {
          ...board,
          activePlan: parsedPlan
        };
        const finalized = finalizeCompletedActivePlan(nextBoard);
        return writeBoardArtifacts(
          projectRoot,
          finalized.board,
          finalized.rolled ? {} : { preserveCurrentPlanMarkdown: true }
        );
      }
    } catch {
      // Fall back to the latest valid JSON/default board below.
    }
  }

  if (!boardJsonExists) {
    return writeBoardArtifacts(projectRoot, board, { preserveCurrentPlanMarkdown: markdownExists });
  }

  return board;
}

export function saveProjectBoard(projectRoot: string, board: CoordexProjectBoard): CoordexProjectBoard {
  const normalizedBoard = normalizeBoard(board);
  normalizedBoard.activePlan.updatedAt = isoNow();
  return writeBoardArtifacts(projectRoot, finalizeCompletedActivePlan(normalizedBoard).board);
}

function locateFeature(board: CoordexProjectBoard, taskId: string): { plan: CoordexPlan; feature: CoordexPlanFeature } | null {
  const activeFeature = board.activePlan.features.find((feature) => feature.id === taskId);
  if (activeFeature) {
    return {
      plan: board.activePlan,
      feature: activeFeature
    };
  }

  for (const plan of board.history) {
    const feature = plan.features.find((entry) => entry.id === taskId);
    if (feature) {
      return {
        plan,
        feature
      };
    }
  }

  return null;
}

export function updateProjectBoardFeature(
  projectRoot: string,
  taskId: string,
  updater: (feature: CoordexPlanFeature, board: CoordexProjectBoard, plan: CoordexPlan) => void
): CoordexProjectBoard {
  const board = loadProjectBoard(projectRoot);
  const located = locateFeature(board, taskId);

  if (!located) {
    throw new Error(`Unknown feature "${taskId}" in project board.`);
  }

  updater(located.feature, board, located.plan);

  const updatedAt = isoNow();
  located.feature.updatedAt = updatedAt;
  located.feature.runState = located.feature.done ? "idle" : located.feature.runState;
  located.plan.updatedAt = updatedAt;
  if (!located.plan.archivedAt) {
    board.activePlan.updatedAt = updatedAt;
  }

  return writeBoardArtifacts(projectRoot, finalizeCompletedActivePlan(board).board);
}

export function archiveProjectBoardPlan(projectRoot: string): CoordexProjectBoard {
  const board = loadProjectBoard(projectRoot);
  const archivedAt = isoNow();
  const archivedPlan: CoordexPlan = {
    ...board.activePlan,
    updatedAt: archivedAt,
    archivedAt
  };

  return writeBoardArtifacts(projectRoot, {
    version: 4,
    activePlan: createEmptyPlan(),
    history: [archivedPlan, ...board.history]
  });
}
