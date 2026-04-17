import { EventEmitter } from "node:events";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import readline from "node:readline";

import type { AuthSummary, CodexThread } from "../shared/types.js";

type JsonRpcSuccess = {
  jsonrpc: "2.0";
  id: number;
  result: unknown;
};

type JsonRpcError = {
  jsonrpc: "2.0";
  id: number;
  error: {
    code: number;
    message: string;
    data?: unknown;
  };
};

type JsonRpcNotification = {
  jsonrpc: "2.0";
  method: string;
  params?: Record<string, unknown>;
};

type PendingRequest = {
  resolve: (value: unknown) => void;
  reject: (error: Error) => void;
};

type LiveThreadState = {
  runningTurnId: string | null;
  draftAssistantText: string;
};

const DEFAULT_THREAD_START = {
  approvalPolicy: "never",
  sandbox: "workspace-write",
  experimentalRawEvents: false
} as const;

export class CodexAppServerClient extends EventEmitter {
  private process: ChildProcessWithoutNullStreams | null = null;
  private pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private initializePromise: Promise<void> | null = null;
  private loadedThreads = new Set<string>();
  private liveThreadState = new Map<string, LiveThreadState>();

  async getAuthSummary(): Promise<AuthSummary> {
    const response = (await this.request("account/read", {
      refreshToken: false
    })) as {
      account: { type: "chatgpt"; email: string; planType: string } | { type: "apiKey" } | null;
      requiresOpenaiAuth: boolean;
    };

    if (!response.account) {
      return {
        status: "unauthenticated",
        mode: null,
        email: null,
        planType: null,
        requiresOpenaiAuth: response.requiresOpenaiAuth
      };
    }

    if (response.account.type === "chatgpt") {
      return {
        status: "authenticated",
        mode: "chatgpt",
        email: response.account.email,
        planType: response.account.planType,
        requiresOpenaiAuth: response.requiresOpenaiAuth
      };
    }

    return {
      status: "authenticated",
      mode: "apiKey",
      email: null,
      planType: null,
      requiresOpenaiAuth: response.requiresOpenaiAuth
    };
  }

  async startChatgptLogin(): Promise<{ loginId: string; authUrl: string }> {
    const response = (await this.request("account/login/start", {
      type: "chatgpt"
    })) as { type: string; loginId?: string; authUrl?: string };

    if (response.type !== "chatgpt" || !response.loginId || !response.authUrl) {
      throw new Error("Unexpected login response from Codex app-server.");
    }

    return {
      loginId: response.loginId,
      authUrl: response.authUrl
    };
  }

  async listThreadsForProject(projectRoot: string): Promise<CodexThread[]> {
    const threads: CodexThread[] = [];
    let cursor: string | null = null;

    for (let page = 0; page < 8; page += 1) {
      const response = (await this.request("thread/list", {
        cursor,
        limit: 100,
        archived: false,
        sortKey: "updated_at"
      })) as {
        data: CodexThread[];
        nextCursor: string | null;
      };

      const matching = response.data.filter((thread) => this.belongsToProject(thread.cwd, projectRoot));
      threads.push(...matching);

      if (!response.nextCursor) {
        break;
      }

      cursor = response.nextCursor;
    }

    const deduped = new Map<string, CodexThread>();
    for (const thread of threads) {
      deduped.set(thread.id, thread);
    }

    return [...deduped.values()].sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async readThread(threadId: string): Promise<CodexThread> {
    const response = (await this.request("thread/read", {
      threadId,
      includeTurns: true
    })) as { thread: CodexThread };

    return response.thread;
  }

  async createThread(cwd: string, title: string): Promise<{ threadId: string }> {
    const response = (await this.request("thread/start", {
      cwd,
      ...DEFAULT_THREAD_START
    })) as {
      thread: { id: string };
    };

    if (title.trim()) {
      await this.request("thread/name/set", {
        threadId: response.thread.id,
        name: title.trim()
      });
    }

    return {
      threadId: response.thread.id
    };
  }

  async sendMessage(threadId: string, cwd: string, text: string): Promise<{ turnId: string }> {
    await this.resumeThread(threadId, cwd);

    const response = (await this.request("turn/start", {
      threadId,
      cwd,
      input: [
        {
          type: "text",
          text,
          text_elements: []
        }
      ]
    })) as {
      turn: { id: string };
    };

    return { turnId: response.turn.id };
  }

  getLiveState(threadId: string): LiveThreadState {
    return this.liveThreadState.get(threadId) ?? {
      runningTurnId: null,
      draftAssistantText: ""
    };
  }

  private async resumeThread(threadId: string, cwd: string): Promise<void> {
    if (this.loadedThreads.has(threadId)) {
      return;
    }

    await this.request("thread/resume", {
      threadId,
      cwd
    });

    this.loadedThreads.add(threadId);
  }

  private async request(method: string, params: Record<string, unknown> | undefined): Promise<unknown> {
    await this.ensureReady();
    const id = this.nextId;
    this.nextId += 1;

    const payload = {
      jsonrpc: "2.0" as const,
      id,
      method,
      params
    };

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write(payload);
    });
  }

  private notify(method: string, params?: Record<string, unknown>): void {
    this.write({
      jsonrpc: "2.0" as const,
      method,
      params
    });
  }

  private async ensureReady(): Promise<void> {
    if (this.initializePromise) {
      return this.initializePromise;
    }

    this.initializePromise = new Promise((resolve, reject) => {
      const child = spawn("codex", ["app-server", "--listen", "stdio://"], {
        stdio: ["pipe", "pipe", "pipe"],
        env: process.env
      });

      this.process = child;

      const lineReader = readline.createInterface({
        input: child.stdout
      });

      lineReader.on("line", (line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return;
        }

        try {
          const message = JSON.parse(trimmed) as JsonRpcSuccess | JsonRpcError | JsonRpcNotification;
          this.handleMessage(message);
        } catch (error) {
          this.emit("notification", {
            method: "coordex/parseError",
            params: {
              line: trimmed,
              error: error instanceof Error ? error.message : String(error)
            }
          });
        }
      });

      child.stderr.on("data", (chunk) => {
        const text = chunk.toString().trim();
        if (text) {
          this.emit("notification", {
            method: "coordex/stderr",
            params: {
              text
            }
          });
        }
      });

      child.once("exit", (code, signal) => {
        const message = `codex app-server exited (${code ?? "null"}, ${signal ?? "null"})`;
        for (const pending of this.pending.values()) {
          pending.reject(new Error(message));
        }

        this.pending.clear();
        this.process = null;
        this.initializePromise = null;
        this.loadedThreads.clear();
        this.liveThreadState.clear();
      });

      this.requestUnsafe("initialize", {
        clientInfo: {
          name: "coordex_local_web",
          title: "Coordex Local Web",
          version: "0.1.0"
        }
      })
        .then(() => {
          this.notify("initialized", {});
          resolve();
        })
        .catch((error) => {
          reject(error);
        });
    });

    return this.initializePromise;
  }

  private async requestUnsafe(method: string, params: Record<string, unknown>): Promise<unknown> {
    const id = this.nextId;
    this.nextId += 1;

    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.write({
        jsonrpc: "2.0" as const,
        id,
        method,
        params
      });
    });
  }

  private write(message: Record<string, unknown>): void {
    if (!this.process) {
      throw new Error("Codex app-server is not running.");
    }

    this.process.stdin.write(`${JSON.stringify(message)}\n`);
  }

  private handleMessage(message: JsonRpcSuccess | JsonRpcError | JsonRpcNotification): void {
    if ("id" in message && ("result" in message || "error" in message)) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }

      this.pending.delete(message.id);

      if ("error" in message) {
        pending.reject(new Error(message.error.message));
        return;
      }

      pending.resolve(message.result);
      return;
    }

    if ("method" in message) {
      this.updateLiveState(message);
      this.emit("notification", message);
    }
  }

  private updateLiveState(message: JsonRpcNotification): void {
    switch (message.method) {
      case "thread/started": {
        const thread = message.params?.thread as { id?: string } | undefined;
        if (thread?.id) {
          this.loadedThreads.add(thread.id);
        }
        return;
      }
      case "thread/closed": {
        const threadId = message.params?.threadId;
        if (typeof threadId === "string") {
          this.loadedThreads.delete(threadId);
          this.liveThreadState.delete(threadId);
        }
        return;
      }
      case "turn/started": {
        const threadId = message.params?.threadId;
        const turn = message.params?.turn as { id?: string } | undefined;
        if (typeof threadId === "string") {
          this.liveThreadState.set(threadId, {
            runningTurnId: turn?.id ?? null,
            draftAssistantText: ""
          });
        }
        return;
      }
      case "item/agentMessage/delta": {
        const threadId = message.params?.threadId;
        const delta = message.params?.delta;
        if (typeof threadId === "string" && typeof delta === "string") {
          const current = this.getLiveState(threadId);
          this.liveThreadState.set(threadId, {
            runningTurnId: current.runningTurnId,
            draftAssistantText: `${current.draftAssistantText}${delta}`
          });
        }
        return;
      }
      case "turn/completed": {
        const threadId = message.params?.threadId;
        if (typeof threadId === "string") {
          this.liveThreadState.set(threadId, {
            runningTurnId: null,
            draftAssistantText: ""
          });
        }
        return;
      }
      default:
        return;
    }
  }

  private belongsToProject(threadCwd: string, projectRoot: string): boolean {
    const normalizedThread = threadCwd.replace(/\\/g, "/");
    const normalizedProject = projectRoot.replace(/\\/g, "/");
    return normalizedThread === normalizedProject || normalizedThread.startsWith(`${normalizedProject}/`);
  }
}
