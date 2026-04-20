import { existsSync } from "node:fs";
import { resolve } from "node:path";

import type { AgentProjectTemplate, AgentRoleTemplate } from "../shared/agents.js";
import type { CodexThread } from "../shared/types.js";

export const AGENT_READY_TOKEN = "READY_FOR_ASSIGNMENT";
export const ROOT_CHAT_READY_TOKEN = "ROOT_CHAT_READY";

const MAX_AGENT_STARTUP_DOCS = 12;

export function resolveAgentInitializationDocs(input: {
  projectRoot: string;
  projectTemplate: AgentProjectTemplate;
  roleTemplate?: AgentRoleTemplate;
  roleStateKey?: string;
}): string[] {
  const orderedCandidates = [
    "docs/project/project-method.md",
    ".coordex/current-plan.md",
    input.roleStateKey ? `docs/project/role-state/${input.roleStateKey}.md` : "",
    "docs/project/decision-log.md",
    ...input.projectTemplate.sharedStartupDocCandidates,
    ...(input.roleTemplate?.startupDocCandidates ?? [])
  ];
  const seen = new Set<string>();
  const resolved: string[] = [];

  for (const candidate of orderedCandidates) {
    const normalized = candidate.trim().replace(/^\.?\//, "");
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);

    if (existsSync(resolve(input.projectRoot, normalized))) {
      resolved.push(normalized);
    }

    if (resolved.length >= MAX_AGENT_STARTUP_DOCS) {
      break;
    }
  }

  return resolved;
}

export function buildAgentInitializationPrompt(input: {
  projectName: string;
  projectRoot: string;
  roleName: string;
  rolePurpose?: string | null;
  startupDocs: string[];
}): string {
  const purposeLine = input.rolePurpose?.trim()
    ? `Intended role purpose: ${input.rolePurpose.trim()}`
    : "Intended role purpose: follow the role instructions already loaded for this thread.";
  const startupDocLines =
    input.startupDocs.length > 0
      ? ["Priority project files to read if they exist:", ...input.startupDocs.map((path, index) => `${index + 1}. ${path}`)].join("\n")
      : "No extra project files are listed for startup. Rely on the loaded instruction chain and the root project docs that already apply.";

  return [
    "[Coordex Agent Initialization]",
    "",
    `Project: ${input.projectName}`,
    `Project root: ${input.projectRoot}`,
    `Role: ${input.roleName}`,
    purposeLine,
    "",
    "This message exists only to initialize the durable role thread after creation.",
    "Treat the instructions already loaded for this thread at startup as the primary persistent rules.",
    "You may use read-only file inspection tools to read only the priority project files listed below.",
    "Do not inspect unrelated files. Do not edit anything. Do not start implementation work. Do not browse the web. Do not run tests or long-lived commands.",
    "When later work depends on engine, platform, framework, editor, build, or runtime rules, start with the official docs for the actual project stack before widening into generic web search.",
    "Prefer existing documented engine, framework, platform, or runtime capabilities before inventing custom workarounds.",
    "If the startup docs include a structured coordination protocol, treat that protocol as the required format for later role-to-role and role-to-supervisor coordination.",
    "",
    startupDocLines,
    "",
    "Reply in plain text with exactly these six parts:",
    "Start directly at `1. Role:` with no introduction or preamble before it.",
    "1. Role: one concise sentence naming your role and primary responsibility.",
    "2. Inputs: two or three bullet points naming the loaded instructions and project docs you will treat as authoritative.",
    "3. Project facts: three to five short bullet points with stable facts you learned, such as stack, directories, debug path, or current milestone.",
    "4. Workflow: two or three short bullet points covering how work reaches you and how you should hand it back.",
    "5. Unknowns: one short line with missing authority you still need, or `None.` if nothing blocks startup.",
    "6. Ready: write the header `6. Ready:` and then put the ready token on its own next line.",
    AGENT_READY_TOKEN,
    "",
    "Keep the whole reply concise."
  ].join("\n");
}

export function buildRootChatInitializationPrompt(input: {
  projectName: string;
  chatTitle: string;
}): string {
  return [
    "[Coordex Root Chat Initialization]",
    "",
    `Project: ${input.projectName}`,
    `Chat: ${input.chatTitle}`,
    "",
    "This message exists only to initialize a newly created project-root chat so it becomes visible and stable across Coordex and Codex surfaces.",
    "Do not use any tools. Do not read any files. Do not edit anything. Do not begin task work yet.",
    "",
    "Reply in plain text with exactly two lines:",
    "1. Root chat ready for project coordination.",
    `2. ${ROOT_CHAT_READY_TOKEN}`
  ].join("\n");
}

export function extractAssistantTextForTurn(thread: CodexThread, turnId: string): string {
  const turn = thread.turns.find((entry) => entry.id === turnId);
  if (!turn) {
    throw new Error(`Turn ${turnId} was not found after initialization.`);
  }

  if (turn.status !== "completed") {
    throw new Error(`Initialization turn finished with status "${turn.status}".`);
  }

  const assistantText = turn.items
    .filter((item): item is Extract<typeof item, { type: "agentMessage"; text: string }> => item.type === "agentMessage")
    .map((item) => item.text.trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();

  if (!assistantText) {
    throw new Error("Initialization completed without an assistant reply.");
  }

  return assistantText;
}

export function assertReadySignal(text: string): void {
  if (!text.includes(AGENT_READY_TOKEN)) {
    throw new Error(`Initialization reply did not include the required ready signal "${AGENT_READY_TOKEN}".`);
  }
}

export function assertRootChatReadySignal(text: string): void {
  if (!text.includes(ROOT_CHAT_READY_TOKEN)) {
    throw new Error(`Root chat initialization reply did not include the required ready signal "${ROOT_CHAT_READY_TOKEN}".`);
  }
}
