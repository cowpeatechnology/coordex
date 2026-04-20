import { existsSync, readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";

import { CodexAppServerClient } from "../src/server/codex-app-server.ts";

type HookEvent = {
  hookEventName: string;
  marker?: string;
  counter?: number;
  detectedAt?: string;
  source?: string | null;
  sessionId?: string | null;
  transcriptPath?: string | null;
  cwd?: string;
  projectRoot?: string;
};

const DEFAULT_THREAD_START = {
  approvalPolicy: "never",
  sandbox: "danger-full-access",
  experimentalRawEvents: false,
  model: "gpt-5.4"
} as const;

const DEFAULT_THREAD_RESUME = {
  approvalPolicy: "never",
  sandbox: "danger-full-access"
} as const;

const DEFAULT_TURN_START = {
  approvalPolicy: "never",
  sandboxPolicy: {
    type: "dangerFullAccess"
  }
} as const;

const workspace = process.argv[2] ?? "/Users/mawei/MyWork/CodexHookLab";
const runtimeDir = resolve(workspace, ".coordex/runtime");
const counterPath = resolve(runtimeDir, "session-start-counter.txt");
const lastPath = resolve(runtimeDir, "session-start-last.json");
const eventsPath = resolve(runtimeDir, "session-start-events.jsonl");

const probePrompt =
  "Do not use tools. Do not read files. If a startup marker has already been loaded into this session, reply with exactly that startup marker and nothing else. Otherwise reply with exactly UNKNOWN.";

const chatterPrompts = [
  "Reply with exactly CHAT_1 and nothing else.",
  "Reply with exactly CHAT_2 and nothing else.",
  "Reply with exactly CHAT_3 and nothing else."
];

const sleep = (ms: number) => new Promise((resolvePromise) => setTimeout(resolvePromise, ms));

function resetRuntime(): void {
  for (const path of [counterPath, lastPath, eventsPath]) {
    rmSync(path, { force: true });
  }
}

function readEvents(): HookEvent[] {
  if (!existsSync(eventsPath)) {
    return [];
  }

  return readFileSync(eventsPath, "utf8")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as HookEvent);
}

function readLast(): HookEvent | null {
  if (!existsSync(lastPath)) {
    return null;
  }

  return JSON.parse(readFileSync(lastPath, "utf8")) as HookEvent;
}

function latestAssistantText(thread: Awaited<ReturnType<CodexAppServerClient["readThread"]>>, turnId: string): string | null {
  const turn = thread.turns.find((entry) => entry.id === turnId);
  if (!turn) {
    return null;
  }

  const agentMessages = turn.items.filter(
    (item): item is Extract<(typeof turn.items)[number], { type: "agentMessage"; text: string }> => item.type === "agentMessage"
  );

  return agentMessages.at(-1)?.text ?? null;
}

function phase(label: string, data: unknown): void {
  console.log(`\n## ${label}`);
  console.log(JSON.stringify(data, null, 2));
}

async function withClient<T>(run: (client: CodexAppServerClient) => Promise<T>): Promise<T> {
  const client = new CodexAppServerClient();
  try {
    return await run(client);
  } finally {
    const processRef = (client as unknown as { process?: { kill: (signal?: NodeJS.Signals) => void; killed?: boolean } }).process;
    if (processRef && !processRef.killed) {
      processRef.kill("SIGTERM");
      await sleep(300);
    }
  }
}

async function rawRequest<T>(client: CodexAppServerClient, method: string, params: Record<string, unknown>): Promise<T> {
  return (await (client as unknown as { request: (method: string, params: Record<string, unknown>) => Promise<T> }).request(
    method,
    params
  )) as T;
}

async function createThreadAndFirstTurn(): Promise<{ threadId: string; turnId: string; reply: string | null }> {
  return await withClient(async (client) => {
    const response = await rawRequest<{ thread: { id: string } }>(client, "thread/start", {
      cwd: workspace,
      ...DEFAULT_THREAD_START
    });

    await sleep(800);

    const turnResponse = await rawRequest<{ turn: { id: string } }>(client, "turn/start", {
      threadId: response.thread.id,
      cwd: workspace,
      ...DEFAULT_TURN_START,
      input: [
        {
          type: "text",
          text: probePrompt,
          text_elements: []
        }
      ]
    });

    const thread = await waitForTurnCompletionRobust(client, response.thread.id, turnResponse.turn.id);

    return {
      threadId: response.thread.id,
      turnId: turnResponse.turn.id,
      reply: latestAssistantText(thread, turnResponse.turn.id)
    };
  });
}

async function explicitResume(threadId: string): Promise<void> {
  await withClient(async (client) => {
    await rawRequest(client, "thread/resume", {
      threadId,
      cwd: workspace,
      ...DEFAULT_THREAD_RESUME
    });
    await sleep(800);
  });
}

async function startTurnWithoutExplicitResume(threadId: string, text: string): Promise<{ turnId: string; reply: string | null }> {
  return await withClient(async (client) => {
    const response = await rawRequest<{ turn: { id: string } }>(client, "turn/start", {
      threadId,
      cwd: workspace,
      ...DEFAULT_TURN_START,
      input: [
        {
          type: "text",
          text,
          text_elements: []
        }
      ]
    });

    const thread = await waitForTurnCompletionRobust(client, threadId, response.turn.id);

    return {
      turnId: response.turn.id,
      reply: latestAssistantText(thread, response.turn.id)
    };
  });
}

async function resumeThenProbe(threadId: string): Promise<{ turnId: string; reply: string | null }> {
  return await withClient(async (client) => {
    await rawRequest(client, "thread/resume", {
      threadId,
      cwd: workspace,
      ...DEFAULT_THREAD_RESUME
    });
    await sleep(800);

    const response = await rawRequest<{ turn: { id: string } }>(client, "turn/start", {
      threadId,
      cwd: workspace,
      ...DEFAULT_TURN_START,
      input: [
        {
          type: "text",
          text: probePrompt,
          text_elements: []
        }
      ]
    });

    const thread = await waitForTurnCompletionRobust(client, threadId, response.turn.id);

    return {
      turnId: response.turn.id,
      reply: latestAssistantText(thread, response.turn.id)
    };
  });
}

async function chatterThenCompactThenProbe(threadId: string): Promise<{
  chatter: Array<{ turnId: string; reply: string | null }>;
  compactTurn: { id: string; status: string; itemTypes: string[] } | null;
  postCompactProbe: { turnId: string; reply: string | null };
}> {
  return await withClient(async (client) => {
    await rawRequest(client, "thread/resume", {
      threadId,
      cwd: workspace,
      ...DEFAULT_THREAD_RESUME
    });
    await sleep(800);

    const chatterResults: Array<{ turnId: string; reply: string | null }> = [];

    for (const text of chatterPrompts) {
      const response = await rawRequest<{ turn: { id: string } }>(client, "turn/start", {
        threadId,
        cwd: workspace,
        ...DEFAULT_TURN_START,
        input: [
          {
            type: "text",
            text,
            text_elements: []
          }
        ]
      });

      const thread = await waitForTurnCompletionRobust(client, threadId, response.turn.id);

      chatterResults.push({
        turnId: response.turn.id,
        reply: latestAssistantText(thread, response.turn.id)
      });
    }

    const beforeCompact = await client.readThread(threadId);
    const beforeTurnCount = beforeCompact.turns.length;
    await rawRequest(client, "thread/compact/start", {
      threadId
    });

    const compactDeadline = Date.now() + 180_000;
    let compactTurn: { id: string; status: string; itemTypes: string[] } | null = null;
    while (Date.now() < compactDeadline) {
      const thread = await client.readThread(threadId);
      if (thread.turns.length > beforeTurnCount) {
        const lastTurn = thread.turns.at(-1) ?? null;
        if (lastTurn && lastTurn.status !== "inProgress") {
          compactTurn = {
            id: lastTurn.id,
            status: lastTurn.status,
            itemTypes: lastTurn.items.map((item) => item.type)
          };
          break;
        }
      }

      await sleep(1_000);
    }

    if (!compactTurn) {
      throw new Error("Timed out waiting for compaction turn to finish.");
    }

    const probeResponse = await rawRequest<{ turn: { id: string } }>(client, "turn/start", {
      threadId,
      cwd: workspace,
      ...DEFAULT_TURN_START,
      input: [
        {
          type: "text",
          text: probePrompt,
          text_elements: []
        }
      ]
    });

    const probeThread = await waitForTurnCompletionRobust(client, threadId, probeResponse.turn.id);

    return {
      chatter: chatterResults,
      compactTurn,
      postCompactProbe: {
        turnId: probeResponse.turn.id,
        reply: latestAssistantText(probeThread, probeResponse.turn.id)
      }
    };
  });
}

async function main(): Promise<void> {
  resetRuntime();
  phase("workspace", {
    workspace
  });
  phase("after-reset", {
    events: readEvents(),
    last: readLast()
  });

  const created = await createThreadAndFirstTurn();
  phase("after-thread-start-and-first-turn", {
    result: created,
    eventCount: readEvents().length,
    last: readLast()
  });

  const threadId = created.threadId;
  await explicitResume(threadId);
  phase("after-explicit-resume-only", {
    eventCount: readEvents().length,
    last: readLast()
  });

  const resumeProbe = await resumeThenProbe(threadId);
  phase("after-resume-then-probe", {
    result: resumeProbe,
    eventCount: readEvents().length,
    last: readLast()
  });

  const compactionResult = await chatterThenCompactThenProbe(threadId);
  phase("after-chatter-compact-probe", {
    result: compactionResult,
    eventCount: readEvents().length,
    last: readLast()
  });

  const finalResumeProbe = await resumeThenProbe(threadId);
  phase("after-fresh-resume-post-compaction", {
    result: finalResumeProbe,
    eventCount: readEvents().length,
    last: readLast()
  });
}

async function waitForTurnCompletionRobust(
  client: CodexAppServerClient,
  threadId: string,
  turnId: string,
  timeoutMs = 180_000
): Promise<Awaited<ReturnType<CodexAppServerClient["readThread"]>>> {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const thread = await client.readThread(threadId);
      const turn = thread.turns.find((entry) => entry.id === turnId);

      if (turn && turn.status !== "inProgress") {
        return thread;
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("not materialized yet")) {
        throw error;
      }
    }

    await sleep(1_000);
  }

  throw new Error(`Timed out waiting for turn ${turnId} to complete.`);
}

await main();
