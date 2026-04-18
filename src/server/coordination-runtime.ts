import { randomUUID } from "node:crypto";

import type { CoordexPlanCoordination, CoordexProjectBoard, CodexTurn } from "../shared/types.js";
import type { CodexAppServerClient } from "./codex-app-server.js";
import { updateProjectBoardFeature } from "./project-board.js";
import type { StateStore } from "./store.js";

type StructuredCoordinationEnvelope = {
  protocol_version: "coordex-agent-io.v1";
  task_id: string;
  from_role: string;
  to_role: string;
  kind: CoordexPlanCoordination["kind"];
  status: CoordexPlanCoordination["status"];
  summary: string;
  input: string;
  expected_output: string;
  output: string;
};

type RuntimeDependencies = {
  store: StateStore;
  codex: CodexAppServerClient;
  onBoardChanged: (projectId: string, board: CoordexProjectBoard) => void;
};

const isoNow = (): string => new Date().toISOString();

function normalizeRoleName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function extractStructuredEnvelopeFromTurn(turn: CodexTurn): StructuredCoordinationEnvelope | null {
  const agentMessages = turn.items.filter(
    (item): item is Extract<typeof item, { type: "agentMessage"; text: string }> => item.type === "agentMessage"
  );

  for (let index = agentMessages.length - 1; index >= 0; index -= 1) {
    const text = agentMessages[index]?.text?.trim();
    if (!text || !text.startsWith("{")) {
      continue;
    }

    try {
      const parsed = JSON.parse(text) as Partial<StructuredCoordinationEnvelope>;
      if (
        parsed.protocol_version === "coordex-agent-io.v1" &&
        typeof parsed.task_id === "string" &&
        typeof parsed.from_role === "string" &&
        typeof parsed.to_role === "string" &&
        typeof parsed.kind === "string" &&
        typeof parsed.status === "string" &&
        typeof parsed.summary === "string" &&
        typeof parsed.input === "string" &&
        typeof parsed.expected_output === "string" &&
        typeof parsed.output === "string"
      ) {
        return {
          protocol_version: parsed.protocol_version,
          task_id: parsed.task_id.trim(),
          from_role: parsed.from_role.trim(),
          to_role: parsed.to_role.trim(),
          kind: parsed.kind as StructuredCoordinationEnvelope["kind"],
          status: parsed.status as StructuredCoordinationEnvelope["status"],
          summary: parsed.summary.trim(),
          input: parsed.input.trim(),
          expected_output: parsed.expected_output.trim(),
          output: parsed.output.trim()
        };
      }
    } catch {
      // Ignore non-JSON commentary entries and keep scanning backward.
    }
  }

  return null;
}

function extractUserText(turn: CodexTurn): string {
  return turn.items
    .filter((item): item is Extract<typeof item, { type: "userMessage" }> => item.type === "userMessage")
    .flatMap((item) => item.content)
    .map((content) => content.text ?? content.path ?? content.url ?? "")
    .join("\n")
    .trim();
}

function extractTaskIdFromTurn(turn: CodexTurn): string | null {
  const userText = extractUserText(turn);
  if (!userText) {
    return null;
  }

  const lineMatch = userText.match(/(?:^|\n)task_id:\s*([A-Za-z0-9._:-]+)/i);
  if (lineMatch?.[1]) {
    return lineMatch[1].trim();
  }

  const jsonMatch = userText.match(/"task_id"\s*:\s*"([^"]+)"/);
  return jsonMatch?.[1]?.trim() || null;
}

function buildSupervisorRelayMessage(envelope: StructuredCoordinationEnvelope): string {
  return [
    "[Coordex Structured Coordination]",
    "",
    `A structured coordination event for active task \`${envelope.task_id}\` has arrived.`,
    "Process it according to the supervisor rules already loaded for this thread.",
    "If the event is a completion report with sufficient evidence, perform acceptance, update the durable plan or board records, and return exactly one JSON object with no prose before or after it.",
    "If the event is a blocker or needs more routing, continue the subfunction without widening scope.",
    "",
    JSON.stringify(envelope, null, 2)
  ].join("\n");
}

function buildRoleRelayMessage(envelope: StructuredCoordinationEnvelope, roleName: string): string {
  return [
    "[Coordex Structured Coordination]",
    "",
    `You are receiving an in-scope coordination event for active task \`${envelope.task_id}\`.`,
    `Target role: ${roleName}.`,
    "Treat the JSON below as the authoritative coordination input for this subfunction.",
    "Continue only within this task's scope and reply with exactly one JSON object when you need to hand off, report a blocker, ask a scoped question, or return a result.",
    "",
    JSON.stringify(envelope, null, 2)
  ].join("\n");
}

export class AutoCoordinationRuntime {
  private readonly processedTurnIds = new Set<string>();

  constructor(private readonly deps: RuntimeDependencies) {}

  async handleNotification(notification: { method: string; params?: Record<string, unknown> }): Promise<void> {
    switch (notification.method) {
      case "turn/completed": {
        const threadId = typeof notification.params?.threadId === "string" ? notification.params.threadId : null;
        if (threadId) {
          await this.handleCompletedTurn(threadId);
        }
        return;
      }
      case "turn/failed":
      case "turn/cancelled":
      case "turn/interrupted": {
        const threadId = typeof notification.params?.threadId === "string" ? notification.params.threadId : null;
        if (threadId) {
          await this.handleStoppedTurn(threadId, notification.method.replace("turn/", ""));
        }
        return;
      }
      default:
        return;
    }
  }

  private async handleCompletedTurn(threadId: string): Promise<void> {
    const chat = this.deps.store.getChatByThreadId(threadId);
    if (!chat || chat.kind !== "agent") {
      return;
    }

    const project = this.deps.store.getProject(chat.projectId);
    if (!project) {
      return;
    }

    const thread = await this.deps.codex.readThread(threadId);
    const turn = [...thread.turns]
      .reverse()
      .find((entry) => entry.status === "completed" && !this.processedTurnIds.has(entry.id));

    if (!turn) {
      return;
    }

    this.processedTurnIds.add(turn.id);
    const envelope = extractStructuredEnvelopeFromTurn(turn);
    if (!envelope) {
      return;
    }

    const targetRole = normalizeRoleName(envelope.to_role);
    const targetChat =
      targetRole && targetRole !== "human"
        ? this.deps.store
            .getChatsForProject(project.id)
            .find((candidate) => candidate.kind === "agent" && normalizeRoleName(candidate.roleName) === targetRole) ?? null
        : null;

    const nextRunState =
      targetRole === "human" ? (envelope.kind === "blocker" || envelope.status === "blocked" ? "blocked" : "idle") : targetChat ? "running" : "blocked";

    const board = updateProjectBoardFeature(project.rootPath, envelope.task_id, (feature) => {
      feature.coordinations.push({
        id: randomUUID(),
        fromRole: envelope.from_role,
        toRole: envelope.to_role,
        kind: envelope.kind,
        summary: envelope.summary,
        input: envelope.input,
        expectedOutput: envelope.expected_output,
        output: envelope.output,
        status: envelope.status,
        createdAt: isoNow(),
        updatedAt: isoNow()
      });

      if (!feature.done) {
        feature.runState = nextRunState;
      }
    });
    this.deps.onBoardChanged(project.id, board);

    if (!targetChat) {
      return;
    }

    const relayMessage =
      normalizeRoleName(targetChat.roleName) === "supervisor"
        ? buildSupervisorRelayMessage(envelope)
        : buildRoleRelayMessage(envelope, targetChat.roleName ?? targetChat.title);

    await this.deps.codex.sendMessage(targetChat.threadId, targetChat.cwd, relayMessage);
  }

  private async handleStoppedTurn(threadId: string, stoppedStatus: string): Promise<void> {
    const chat = this.deps.store.getChatByThreadId(threadId);
    if (!chat || chat.kind !== "agent") {
      return;
    }

    const project = this.deps.store.getProject(chat.projectId);
    if (!project) {
      return;
    }

    const thread = await this.deps.codex.readThread(threadId);
    const turn = [...thread.turns]
      .reverse()
      .find((entry) => entry.status === stoppedStatus && !this.processedTurnIds.has(entry.id));

    if (!turn) {
      return;
    }

    this.processedTurnIds.add(turn.id);
    const taskId = extractTaskIdFromTurn(turn);
    if (!taskId) {
      return;
    }

    const board = updateProjectBoardFeature(project.rootPath, taskId, (feature) => {
      feature.coordinations.push({
        id: randomUUID(),
        fromRole: chat.roleName?.trim() || chat.title,
        toRole: "human",
        kind: "blocker",
        summary: `${chat.roleName?.trim() || chat.title} turn ${stoppedStatus}`,
        input: extractUserText(turn),
        expectedOutput: "Automatic subtask execution should continue until a structured completion or a real blocker is reported.",
        output: `Coordex observed turn status "${stoppedStatus}" before the active subfunction produced a structured completion message.`,
        status: "blocked",
        createdAt: isoNow(),
        updatedAt: isoNow()
      });

      if (!feature.done) {
        feature.runState = "blocked";
      }
    });
    this.deps.onBoardChanged(project.id, board);
  }
}
