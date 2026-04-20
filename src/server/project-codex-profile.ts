import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

import type { CodexExecutionProfile } from "../shared/types.js";

const EMPTY_PROFILE: CodexExecutionProfile = {
  model: null,
  reasoningEffort: null
};

function parseQuotedTomlValue(content: string, key: string): string | null {
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = content.match(new RegExp(`^\\s*${escapedKey}\\s*=\\s*["']([^"']+)["']\\s*$`, "m"));
  return match?.[1]?.trim() || null;
}

function parseProfile(content: string): CodexExecutionProfile {
  return {
    model: parseQuotedTomlValue(content, "model"),
    reasoningEffort: parseQuotedTomlValue(content, "model_reasoning_effort")
  };
}

function upsertRootQuotedTomlValue(content: string, key: string, value: string): string {
  const lines = content.split(/\r?\n/);
  const escapedKey = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const keyPattern = new RegExp(`^\\s*${escapedKey}\\s*=\\s*["']([^"']*)["']\\s*$`);
  const nextLine = `${key} = "${value}"`;

  let firstTableIndex = -1;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s*\[/.test(line)) {
      firstTableIndex = index;
      break;
    }
  }

  const rootEndIndex = firstTableIndex >= 0 ? firstTableIndex : lines.length;
  for (let index = 0; index < rootEndIndex; index += 1) {
    if (keyPattern.test(lines[index])) {
      lines[index] = nextLine;
      return lines.join("\n");
    }
  }

  const insertIndex = firstTableIndex >= 0 ? firstTableIndex : lines.length;
  const prefix = lines.slice(0, insertIndex);
  const suffix = lines.slice(insertIndex);
  const normalizedPrefix =
    prefix.length > 0 && prefix[prefix.length - 1]?.trim()
      ? [...prefix, "", nextLine]
      : [...prefix, nextLine];

  return [...normalizedPrefix, ...suffix].join("\n");
}

function resolveConfigPathForCwd(cwd: string): string | null {
  let current = resolve(cwd);

  while (true) {
    const candidate = resolve(current, ".codex/config.toml");
    if (existsSync(candidate)) {
      return candidate;
    }

    const parent = dirname(current);
    if (parent === current) {
      return null;
    }

    current = parent;
  }
}

export function readCodexExecutionProfileFromConfigPath(configPath: string | null): CodexExecutionProfile {
  if (!configPath || !existsSync(configPath)) {
    return EMPTY_PROFILE;
  }

  return parseProfile(readFileSync(configPath, "utf8"));
}

export function readCodexExecutionProfileForProject(projectRoot: string): CodexExecutionProfile {
  return readCodexExecutionProfileFromConfigPath(resolve(projectRoot, ".codex/config.toml"));
}

export function readCodexExecutionProfileForCwd(cwd: string): CodexExecutionProfile {
  return readCodexExecutionProfileFromConfigPath(resolveConfigPathForCwd(cwd));
}

export function writeCodexExecutionProfileForProject(
  projectRoot: string,
  profile: { model: string; reasoningEffort: string }
): CodexExecutionProfile {
  const codexDir = resolve(projectRoot, ".codex");
  const configPath = resolve(codexDir, "config.toml");
  const current = existsSync(configPath) ? readFileSync(configPath, "utf8") : "";

  const nextWithModel = upsertRootQuotedTomlValue(current, "model", profile.model);
  const nextContent = upsertRootQuotedTomlValue(nextWithModel, "model_reasoning_effort", profile.reasoningEffort);

  mkdirSync(codexDir, { recursive: true });
  writeFileSync(configPath, nextContent.endsWith("\n") ? nextContent : `${nextContent}\n`, "utf8");

  return readCodexExecutionProfileFromConfigPath(configPath);
}
