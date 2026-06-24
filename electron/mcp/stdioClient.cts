import { createInterface } from "node:readline";
import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";

export interface McpStdioClientOptions {
  readonly command: string;
  readonly args?: readonly string[];
  readonly env?: Readonly<Record<string, string>>;
  readonly timeoutMs?: number;
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: Error) => void;
  readonly timer: ReturnType<typeof setTimeout>;
}

/** Minimal MCP JSON-RPC client over stdio (initialize + tools/list + tools/call). */
export class McpStdioClient {
  private readonly proc: ChildProcess;
  private readonly pending = new Map<number, PendingRequest>();
  private nextId = 1;
  private readonly timeoutMs: number;
  private closed = false;
  private initPromise: Promise<void> | null = null;

  constructor(opts: McpStdioClientOptions) {
    this.timeoutMs = opts.timeoutMs ?? 20_000;
    this.proc = spawn(opts.command, [...(opts.args ?? [])], {
      stdio: ["pipe", "pipe", "pipe"],
      env: { ...process.env, ...(opts.env ?? {}) },
    });
    const rl = createInterface({ input: this.proc.stdout! });
    rl.on("line", (line) => this.onLine(line));
    this.proc.on("error", (err) => this.failAll(err));
    this.proc.on("exit", () => {
      this.closed = true;
      this.failAll(new Error("MCP server exited."));
    });
  }

  private failAll(err: Error): void {
    for (const [id, pending] of this.pending) {
      clearTimeout(pending.timer);
      pending.reject(err);
      this.pending.delete(id);
    }
  }

  private onLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg: { id?: number; result?: unknown; error?: { message?: string } };
    try {
      msg = JSON.parse(trimmed) as typeof msg;
    } catch {
      return;
    }
    if (typeof msg.id !== "number") return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.pending.delete(msg.id);
    if (msg.error?.message) {
      pending.reject(new Error(msg.error.message));
      return;
    }
    pending.resolve(msg.result);
  }

  private send(method: string, params?: unknown, id?: number): void {
    const payload =
      id === undefined
        ? { jsonrpc: "2.0", method, params }
        : { jsonrpc: "2.0", id, method, params };
    this.proc.stdin?.write(`${JSON.stringify(payload)}\n`);
  }

  private request(method: string, params?: unknown): Promise<unknown> {
    if (this.closed) {
      return Promise.reject(new Error("MCP client is closed."));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`MCP request timed out: ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.send(method, params, id);
    });
  }

  async initialize(): Promise<void> {
    if (this.initPromise) return this.initPromise;
    this.initPromise = (async () => {
      await this.request("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: "bryantlabs-studio", version: "0.1.0" },
      });
      this.send("notifications/initialized");
    })();
    return this.initPromise;
  }

  async listTools(): Promise<
    Array<{
      name: string;
      description?: string;
      inputSchema?: unknown;
    }>
  > {
    await this.initialize();
    const result = (await this.request("tools/list")) as {
      tools?: Array<{
        name: string;
        description?: string;
        inputSchema?: unknown;
      }>;
    };
    return result.tools ?? [];
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ content?: Array<{ type?: string; text?: string }> }> {
    await this.initialize();
    return (await this.request("tools/call", {
      name,
      arguments: args,
    })) as { content?: Array<{ type?: string; text?: string }> };
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.proc.kill();
    this.failAll(new Error("MCP client closed."));
  }
}
