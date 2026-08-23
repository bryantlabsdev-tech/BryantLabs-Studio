import { spawn } from "node:child_process";
import * as path from "node:path";
import type { IpcMain } from "electron";
import {
  buildSpawnDiagnostics,
  formatPosixSpawnError,
  logSpawnDiagnostics,
  resolveShellCommand,
  resolveSpawnCwdSync,
  spawnProcessEnv,
} from "./processSpawn.cjs";

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

/** Keep in sync with src/core/agentLoop/agentCommandAllowlist.ts. */
const ARG = String.raw`(?:\s+[\w.\-/=]+)`;

const ALLOWED_COMMANDS: readonly RegExp[] = [
  new RegExp(String.raw`^npm run (build|test|typecheck|lint|preview|dev)${ARG}*$`, "i"),
  new RegExp(String.raw`^npm test${ARG}*$`, "i"),
  new RegExp(String.raw`^npx tsc${ARG}*$`, "i"),
  new RegExp(String.raw`^npx vitest${ARG}*$`, "i"),
  new RegExp(String.raw`^npx eslint${ARG}*$`, "i"),
  new RegExp(String.raw`^git status${ARG}*$`, "i"),
  new RegExp(String.raw`^git diff${ARG}*$`, "i"),
  new RegExp(String.raw`^git log${ARG}*$`, "i"),
  /^node --version$/i,
  /^npm --version$/i,
];

const SHELL_META = /[;&|`$()<>\n\r]|&&|\|\||\$\(/;

const BLOCKED_PATTERNS: readonly RegExp[] = [
  SHELL_META,
  /\brm\s+-rf\b/i,
  /\bsudo\b/i,
  /\bcurl\b/i,
  /\bwget\b/i,
  /\bchmod\b/i,
  /\bchown\b/i,
  /\bkill\b/i,
  /\bpkill\b/i,
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

    const resolvedCommand = resolveShellCommand(command);
    const child = spawn(resolvedCommand, {
      cwd,
      shell: true,
      env: spawnProcessEnv(),
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
        error: formatPosixSpawnError(err),
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
  getProjectRoot: () => string | null = () => null,
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
      const requested = path.resolve(cwd);
      if (!isWithinProject(requested)) {
        return { error: "Working directory is outside the open project." };
      }
      const { cwd: resolved, exists } = resolveSpawnCwdSync(
        requested,
        getProjectRoot(),
      );
      if (!isWithinProject(resolved)) {
        return { error: "Working directory is outside the open project." };
      }
      if (!exists) {
        return { error: "Working directory does not exist." };
      }
      const validationError = validateCommand(command);
      if (validationError) {
        return { error: validationError };
      }
      const diagnostics = buildSpawnDiagnostics({
        command: resolveShellCommand(command),
        cwd: resolved,
      });
      logSpawnDiagnostics(diagnostics, "terminal:exec");
      return runAllowlistedCommand(command, resolved, DEFAULT_TIMEOUT_MS);
    },
  );
}
