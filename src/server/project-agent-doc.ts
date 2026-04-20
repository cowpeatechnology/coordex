import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { DEFAULT_AGENTS_DIRECTORY_NAME } from "../shared/agents.js";
import type { CoordexChat } from "../shared/types.js";
import { listAgentProjectTemplates } from "./template-loader.js";

type ProjectAgentDocEntry = {
  roleName: string;
  roleDirectory: string;
  threadTitle: string | null;
  purpose: string;
};

const GENERIC_ROLE_PURPOSE = "Role-specific operating notes for this directory.";

const AGENT_SECTION_TITLE = "## Coordex Agent Roles";
const AGENT_SECTION_START = "<!-- COORDEX:AGENT-ROSTER:START -->";
const AGENT_SECTION_END = "<!-- COORDEX:AGENT-ROSTER:END -->";

const buildFallbackPurposeByDirectory = (): Map<string, { roleName: string; purpose: string }> =>
  new Map(
    listAgentProjectTemplates().flatMap((template) =>
      template.roles.map((role) => [
        `${template.directoryName}/${role.directoryName}`.toLowerCase(),
        {
          roleName: role.label,
          purpose: role.description
        }
      ])
    )
  );

function parseInstructionField(content: string, field: "Role" | "Purpose"): string | null {
  const match = content.match(new RegExp(`^- ${field}:\\s*(.+)$`, "m"));
  if (!match) {
    return null;
  }

  return match[1].trim().replace(/^`/, "").replace(/`$/, "");
}

function normalizeDirectoryKey(value: string | null | undefined): string {
  return (value ?? "").trim().replace(/\\/g, "/").replace(/^\.?\//, "").replace(/\/+$/, "").toLowerCase();
}

function normalizeRoleName(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

function resolveRoleDirectoryFromCwd(projectRoot: string, cwd: string): string | null {
  const agentsRoot = resolve(projectRoot, DEFAULT_AGENTS_DIRECTORY_NAME);
  const resolvedCwd = resolve(cwd);
  const normalizedAgentsRoot = agentsRoot.replace(/\\/g, "/");
  const normalizedCwd = resolvedCwd.replace(/\\/g, "/");

  if (normalizedCwd === normalizedAgentsRoot || !normalizedCwd.startsWith(`${normalizedAgentsRoot}/`)) {
    return null;
  }

  const relativePath = relative(projectRoot, resolvedCwd).replace(/\\/g, "/").replace(/\/+$/, "");
  return relativePath || null;
}

function collectRoleDirectoryInfo(projectRoot: string): Map<string, Omit<ProjectAgentDocEntry, "threadTitle">> {
  const fallbackPurposeByDirectory = buildFallbackPurposeByDirectory();
  const agentsRoot = resolve(projectRoot, DEFAULT_AGENTS_DIRECTORY_NAME);
  if (!existsSync(agentsRoot)) {
    return new Map();
  }

  const entries = readdirSync(agentsRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const roleDirectory = `${DEFAULT_AGENTS_DIRECTORY_NAME}/${entry.name}`;
      const roleAgentsPath = resolve(agentsRoot, entry.name, "AGENTS.md");
      const legacyRoleOverridePath = resolve(agentsRoot, entry.name, "AGENTS.override.md");
      const roleInstructionPath = existsSync(roleAgentsPath) ? roleAgentsPath : legacyRoleOverridePath;
      const roleInstructionContent = existsSync(roleInstructionPath) ? readFileSync(roleInstructionPath, "utf8") : "";
      const fallback = fallbackPurposeByDirectory.get(roleDirectory.toLowerCase());
      const parsedPurpose = parseInstructionField(roleInstructionContent, "Purpose");

      return {
        roleName: parseInstructionField(roleInstructionContent, "Role") ?? fallback?.roleName ?? entry.name,
        roleDirectory,
        purpose:
          (parsedPurpose && parsedPurpose !== GENERIC_ROLE_PURPOSE ? parsedPurpose : null) ??
          fallback?.purpose ??
          GENERIC_ROLE_PURPOSE
      } satisfies Omit<ProjectAgentDocEntry, "threadTitle">;
    })
    .sort((left, right) => left.roleName.localeCompare(right.roleName));

  return new Map(entries.map((entry) => [normalizeDirectoryKey(entry.roleDirectory), entry]));
}

function collectProjectAgentEntries(projectRoot: string, chats?: CoordexChat[]): ProjectAgentDocEntry[] {
  const roleDirectoryInfo = collectRoleDirectoryInfo(projectRoot);
  const agentChats = (chats ?? []).filter((chat) => chat.kind === "agent");

  if (agentChats.length) {
    const entriesByKey = new Map<string, ProjectAgentDocEntry>();
    const sortedChats = [...agentChats].sort((left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) || right.createdAt.localeCompare(left.createdAt)
    );

    for (const chat of sortedChats) {
      const resolvedRoleDirectory = chat.roleDirectory ?? resolveRoleDirectoryFromCwd(projectRoot, chat.cwd);
      const directoryKey = normalizeDirectoryKey(resolvedRoleDirectory);
      const fallbackKey = normalizeRoleName(chat.roleName);
      const dedupeKey = directoryKey || fallbackKey || chat.threadId;

      if (entriesByKey.has(dedupeKey)) {
        continue;
      }

      const directoryInfo = roleDirectoryInfo.get(directoryKey);
      const roleDirectory =
        resolvedRoleDirectory ??
        directoryInfo?.roleDirectory ??
        `${DEFAULT_AGENTS_DIRECTORY_NAME}/${normalizeRoleName(chat.roleName) || "unassigned"}`;

      entriesByKey.set(dedupeKey, {
        roleName: chat.roleName?.trim() || directoryInfo?.roleName || roleDirectory.split("/").at(-1) || "unknown",
        roleDirectory,
        threadTitle: chat.title.trim() || null,
        purpose: directoryInfo?.purpose ?? GENERIC_ROLE_PURPOSE
      });
    }

    return Array.from(entriesByKey.values()).sort((left, right) => left.roleName.localeCompare(right.roleName));
  }

  return Array.from(roleDirectoryInfo.values())
    .map((entry) => ({
      ...entry,
      threadTitle: null
    }))
    .sort((left, right) => left.roleName.localeCompare(right.roleName));
}

function renderAgentSection(entries: ProjectAgentDocEntry[]): string {
  const lines = [
    AGENT_SECTION_TITLE,
    "",
    AGENT_SECTION_START,
    "This block is maintained by Coordex and keeps active role agents aligned across the local role directories under `Agents/`, the Codex threads started from those directories, and this project-level roster.",
    "",
    "Agent threads should start in `Agents/<role>/` so Codex loads instructions from the project root down to the role directory: this `AGENTS.md`, then `Agents/AGENTS.md`, then `Agents/<role>/AGENTS.md`.",
    "",
    "Root chats created from Coordex remain project-root conversations and are intentionally excluded from this role roster.",
    "",
    "| Role | Directory | Thread | Responsibility |",
    "| --- | --- | --- | --- |"
  ];

  if (!entries.length) {
    lines.push("| _None yet_ | — | — | No role agents have been created from Coordex yet. |");
  } else {
    for (const entry of entries) {
      lines.push(
        `| \`${entry.roleName}\` | \`${entry.roleDirectory}/\` | ${entry.threadTitle ? `\`${entry.threadTitle}\`` : "_Not registered_"} | ${entry.purpose} |`
      );
    }
  }

  lines.push("", AGENT_SECTION_END);
  return `${lines.join("\n")}\n`;
}

export function syncProjectAgentRegistry(projectRoot: string, chats?: CoordexChat[]): void {
  const agents = collectProjectAgentEntries(projectRoot, chats);
  const agentsPath = resolve(projectRoot, "AGENTS.md");
  const nextSection = renderAgentSection(agents);

  if (!existsSync(agentsPath)) {
    return;
  }

  const currentContent = readFileSync(agentsPath, "utf8");
  const fullSectionPattern = new RegExp(
    `${AGENT_SECTION_TITLE}[\\s\\S]*?${AGENT_SECTION_START}[\\s\\S]*?${AGENT_SECTION_END}\\n?`,
    "m"
  );
  const markerPattern = new RegExp(`${AGENT_SECTION_START}[\\s\\S]*?${AGENT_SECTION_END}\\n?`, "m");

  let nextContent: string;
  if (fullSectionPattern.test(currentContent)) {
    nextContent = currentContent.replace(fullSectionPattern, nextSection.trimEnd());
  } else if (markerPattern.test(currentContent)) {
    nextContent = currentContent.replace(markerPattern, nextSection.trimEnd());
  } else {
    const trimmed = currentContent.trimEnd();
    nextContent = `${trimmed}${trimmed ? "\n\n" : ""}${nextSection.trimEnd()}\n`;
  }

  if (!nextContent.endsWith("\n")) {
    nextContent = `${nextContent}\n`;
  }

  writeFileSync(agentsPath, nextContent, "utf8");
}
