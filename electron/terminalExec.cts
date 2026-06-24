import { spawn } from "node:child_process";
import * as path from "node:path";
import type { IpcMain } from "electron";

const OUTPUT_CAP = 80_000;
const DEFAULT_TIMEOUT_MS = 120_000;

export interface TerminalExecResult {
  readonly ok: boolean;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly truncated: boolean;
  readonly error?: string;
}

const ALLOWED_COMMANDS: readonly RegExp[] = [
  /^npm run (build|test|typecheck|lint|preview|dev)(\s|$)/i,
  /^npm test(\s|$)/i,
  /^npx tsc\b/i,
  /^npx vitest\b/i,
  /^npx eslint\b/i,
  /^git status\b/i,
  /^git diff\b/i,
  /^git log\b/i,
  /^node --version\b/i,
  /^npm --version\b/i,
];

const BLOCKED_PATTERNS: readonly RegExp[] = [
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bkill\b/i,
  /\bpkill\b/i,
  /\b>\s*\//,
  /\|\s*sh\b/i,
];

function validateCommand(command: string): string | null {
  const trimmed = command.trim();
  if (!trimmed) return "Command is empty.";
  if (trimmed.length > 240) return "Command exceeds length limit.";
  if (BLOCKED_PATTERNS.some((re) => re.test(trimmed))) {
    return "Command blocked by safety policy.";
  }
  if (!ALLOWED_COMMANDS.some((re) => re.test(trimmed))) {
    return "Command not allowlisted.";
  }
  return null;
}

function runAllowlistedCommand(
  command: string,
  cwd: string,
  timeoutMs: number,
): Promise<TerminalExecResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;

    const child = spawn(command, {
      cwd,
      shell: true,
      env: process.env,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    const append = (target: "stdout" | "stderr", chunk: string) => {
      const current = target === "stdout" ? stdout : stderr;
      const next = current + chunk;
      if (next.length > OUTPUT_CAP) {
        truncated = true;
        if (target === "stdout") stdout = next.slice(0, OUTPUT_CAP);
        else stderr = next.slice(0, OUTPUT_CAP);
      } else if (target === "stdout") {
        stdout = next;
      } else {
        stderr = next;
      }
    };

    child.stdout?.on("data", (buf: Buffer) => append("stdout", buf.toString()));
    child.stderr?.on("data", (buf: Buffer) => append("stderr", buf.toString()));

    child.on("error", (err) => {
      clearTimeout(timer);
      resolve({
        ok: false,
        exitCode: null,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        timedOut,
        truncated,
        error: err.message,
      });
    });

    child.on("close", (code) => {
      clearTimeout(timer);
      const exitCode = typeof code === "number" ? code : null;
      resolve({
        ok: exitCode === 0 && !timedOut,
        exitCode,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        timedOut,
        truncated,
      });
    });
  });
}

export function registerTerminalExecIpc(
  ipcMain: IpcMain,
  isWithinProject: (target: string) => boolean,
): void {
  ipcMain.handle(
    "terminal:exec",
    async (
      _event,
      cwd: string,
      command: string,
    ): Promise<TerminalExecResult | { error: string }> => {
      if (typeof cwd !== "string" || cwd.length === 0) {
        return { error: "Invalid working directory." };
      }
      if (typeof command !== "string") {
        return { error: "Invalid command." };
      }
      const resolved = path.resolve(cwd);
      if (!isWithinProject(resolved)) {
        return { error: "Working directory is outside the open project." };
      }
      const validationError = validateCommand(command);
      if (validationError) {
        return { error: validationError };
      }
      return runAllowlistedCommand(command, resolved, DEFAULT_TIMEOUT_MS);
    },
  );
}
