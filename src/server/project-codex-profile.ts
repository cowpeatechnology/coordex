import { existsSync, readFileSync } from "node:fs";
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
