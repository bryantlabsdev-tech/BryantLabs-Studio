import { spawn, execFileSync } from "node:child_process";
import { realpathSync, lstatSync, accessSync, constants } from "node:fs";
import { promises as fs } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import type { IpcMain, IpcMainInvokeEvent } from "electron";
import { BrowserWindow, app } from "electron";
import { isCanonicalPathWithinRoot } from "./fileWriter.cjs";
import { terminateTrackedPids } from "./processTree.cjs";
import { formatPosixSpawnError } from "./processSpawn.cjs";
import {
  AGENT_COMMAND_OUTPUT_CHARS,
  AGENT_COMMAND_TIMEOUT_MS,
  AGENT_DENIAL_LOG_LIMIT,
  AGENT_EXEC_ENV_KEEP,
  AGENT_EXECUTION_MAX_CONCURRENCY,
  agentEnvKeyForbidden,
  agentExecutionFailureMessage,
  buildAgentExecutionPolicySnapshot,
  isForbiddenAgentLocation,
  parseAgentInspectRequest,
  redactSensitiveText,
  type AgentExecutableIdentity,
  type AgentExecutionClass,
  type AgentExecutionDenialRecord,
  type AgentExecutionFailureCode,
  type AgentExecutionPolicySnapshot,
  type AgentInspectDecision,
} from "./agentExecutionPolicy.cjs";

export {
  AGENT_EXECUTION_POLICY_LABEL,
  agentExecutionFailureMessage,
  buildAgentExecutionPolicySnapshot,
  planAgentCommand,
  parseAgentInspectRequest,
  routeAgentCommandToInspect,
  validateAgentCommand,
} from "./agentExecutionPolicy.cjs";

export interface AgentExecResult {
  readonly ok: boolean;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly truncated: boolean;
  readonly error?: string;
  readonly code?: AgentExecutionFailureCode;
}

interface ExecutableIdentity {
  readonly requested: AgentExecutableIdentity;
  readonly resolved: string;
  readonly real: string;
  readonly ino: string;
  readonly mtimeMs: number;
  readonly size: number;
}

interface Runtime {
  now?: number;
  timeoutMs?: number;
  maxOutputChars?: number;
  allowTmpExecutables?: boolean;
  executableOverrides?: Partial<Record<AgentExecutableIdentity, string>>;
  beforeSpawn?: () => Promise<void> | void;
}

const denialsByOwner = new Map<number, AgentExecutionDenialRecord[]>();
let sessionEpoch = 0;
let inFlight = 0;
let activePid: number | null = null;
let clearing: Promise<void> | null = null;
let testRuntime: Runtime = {};

export function setAgentExecutionRuntimeForTests(runtime: Runtime): void {
  testRuntime = { ...testRuntime, ...runtime };
}

export function resetAgentExecutionRuntimeForTests(): void {
  testRuntime = {};
}

function nowMs(): number {
  return testRuntime.now ?? Date.now();
}

function failResult(code: AgentExecutionFailureCode, ownerId = 0): AgentExecResult {
  recordDenial("agent_readonly_inspect", code, agentExecutionFailureMessage(code), ownerId);
  return {
    ok: false,
    exitCode: null,
    stdout: "",
    stderr: "",
    durationMs: 0,
    timedOut: code === "timeout",
    truncated: code === "output_limit",
    error: agentExecutionFailureMessage(code),
    code,
  };
}

function recordDenial(
  executionClass: AgentExecutionClass,
  code: AgentExecutionFailureCode,
  reason: string,
  ownerId: number,
): void {
  const row: AgentExecutionDenialRecord = {
    at: nowMs(),
    code,
    executionClass,
    reason: redactSensitiveText(reason).slice(0, 240),
    ownerId,
  };
  const list = denialsByOwner.get(ownerId) ?? [];
  list.unshift(row);
  while (list.length > AGENT_DENIAL_LOG_LIMIT) list.pop();
  denialsByOwner.set(ownerId, list);
}

export function listAgentExecutionDenials(ownerId?: number): readonly AgentExecutionDenialRecord[] {
  if (typeof ownerId !== "number") return [];
  return (denialsByOwner.get(ownerId) ?? []).slice(0, AGENT_DENIAL_LOG_LIMIT);
}

export function inspectAgentExecutionPolicy(): AgentExecutionPolicySnapshot {
  return buildAgentExecutionPolicySnapshot();
}

export function trustedInspectPath(): string {
  if (process.platform === "win32") {
    const root = process.env.SystemRoot || "C:\\Windows";
    return `${root}\\System32;${root};${root}\\System32\\OpenSSH`;
  }
  if (process.platform === "darwin") {
    return "/usr/bin:/bin:/opt/homebrew/bin:/usr/local/bin";
  }
  return "/usr/bin:/bin:/usr/local/bin";
}

export function buildAgentExecutionEnv(executableDir: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {};
  for (const key of AGENT_EXEC_ENV_KEEP) {
    const value = process.env[key];
    if (typeof value === "string" && value.length > 0 && !agentEnvKeyForbidden(key)) {
      env[key] = value;
    }
  }
  const delimiter = path.delimiter;
  env.PATH = [executableDir, ...trustedInspectPath().split(delimiter)].filter(Boolean).join(delimiter);
  env.TERM = "dumb";
  env.NO_COLOR = "1";
  env.CI = "1";
  env.GIT_TERMINAL_PROMPT = "0";
  env.GIT_CONFIG_NOSYSTEM = "1";
  env.GIT_CONFIG_GLOBAL = "/dev/null";
  env.GIT_CONFIG_SYSTEM = "/dev/null";
  env.GIT_PAGER = "cat";
  env.GIT_EDITOR = "true";
  env.GIT_OPTIONAL_LOCKS = "0";
  env.GIT_EXTERNAL_DIFF = "";
  env.GIT_ASKPASS = "";
  env.GIT_SSH_COMMAND = "";
  return env;
}

function whichOnTrustedPath(name: string): string | null {
  const trusted = trustedInspectPath();
  try {
    if (process.platform === "win32") {
      const out = execFileSync("where.exe", [name], {
        encoding: "utf8",
        env: { ...process.env, PATH: trusted },
        timeout: 3_000,
        windowsHide: true,
      });
      const first = out.split(/\r?\n/).map((line) => line.trim()).find(Boolean);
      return first ?? null;
    }
    const whichBin = pathExists("/usr/bin/which") ? "/usr/bin/which" : "which";
    const out = execFileSync(whichBin, [name], {
      encoding: "utf8",
      env: { PATH: trusted },
      timeout: 3_000,
    });
    const first = out.split("\n").map((line) => line.trim()).find(Boolean);
    return first ?? null;
  } catch {
    return null;
  }
}

function pathExists(filePath: string): boolean {
  try {
    lstatSync(filePath);
    return true;
  } catch {
    return false;
  }
}

function locationRejected(real: string, projectRoot: string | null): boolean {
  const normalized = real.replace(/\\/g, "/");
  if (normalized.includes("/node_modules/")) return true;
  if (projectRoot && isCanonicalPathWithinRoot(projectRoot, real)) return true;
  if (isForbiddenAgentLocation(real)) return true;
  if (!testRuntime.allowTmpExecutables) {
    try {
      const tmp = realpathSync(os.tmpdir());
      if (real === tmp || real.startsWith(`${tmp}${path.sep}`)) return true;
    } catch {
      return true;
    }
  }
  return false;
}

function captureIdentity(requested: AgentExecutableIdentity, resolved: string): ExecutableIdentity | null {
  try {
    const st = lstatSync(resolved);
    if (!st.isFile() && !st.isSymbolicLink()) return null;
    if (process.platform !== "win32") {
      accessSync(resolved, constants.X_OK);
    }
    const real = realpathSync(resolved);
    const rst = lstatSync(real);
    return {
      requested,
      resolved,
      real,
      ino: `${rst.dev}:${rst.ino}`,
      mtimeMs: rst.mtimeMs,
      size: rst.size,
    };
  } catch {
    return null;
  }
}

export function resolveTrustedExecutable(
  identity: AgentExecutableIdentity,
  projectRoot: string | null,
): ExecutableIdentity | null {
  const override = testRuntime.executableOverrides?.[identity];
  const found = override ?? whichOnTrustedPath(identity);
  if (!found) return null;
  if (!path.isAbsolute(found)) return null;
  const captured = captureIdentity(identity, found);
  if (!captured) return null;
  if (locationRejected(captured.real, projectRoot) || locationRejected(captured.resolved, projectRoot)) {
    return null;
  }
  return captured;
}

function identityMatches(expected: ExecutableIdentity): boolean {
  const next = captureIdentity(expected.requested, expected.resolved);
  if (!next) return false;
  return (
    next.real === expected.real &&
    next.ino === expected.ino &&
    next.mtimeMs === expected.mtimeMs &&
    next.size === expected.size
  );
}

async function lstatKind(target: string): Promise<"missing" | "dir" | "symlink" | "other"> {
  try {
    const st = await fs.lstat(target);
    if (st.isSymbolicLink()) return "symlink";
    if (st.isDirectory()) return "dir";
    return "other";
  } catch {
    return "missing";
  }
}

function realpathOrNull(target: string): string | null {
  try {
    return realpathSync(target);
  } catch {
    return null;
  }
}

export async function clearAgentExecutionSession(): Promise<void> {
  if (clearing) {
    await clearing;
    return;
  }
  sessionEpoch += 1;
  const pid = activePid;
  activePid = null;
  const epoch = sessionEpoch;
  clearing = (async () => {
    if (typeof pid === "number") {
      await terminateTrackedPids([pid], { termGraceMs: 200 });
    }
    if (sessionEpoch === epoch) {
      inFlight = 0;
      activePid = null;
    }
  })().finally(() => {
    clearing = null;
  });
  await clearing;
}

export function isAgentExecutionSenderAllowed(
  event: Pick<IpcMainInvokeEvent, "sender">,
  getMainWindow: () => BrowserWindow | null,
): boolean {
  const wc = event.sender;
  if (!wc || wc.isDestroyed()) return false;
  const type = typeof wc.getType === "function" ? wc.getType() : "window";
  if (type !== "window") return false;
  const win = BrowserWindow.fromWebContents(wc);
  const main = getMainWindow();
  if (!win || !main || win.id !== main.id) return false;
  const url = wc.getURL();
  if (!url) return !app.isPackaged;
  if (url.startsWith("file:") && url.includes("index.html")) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/i.test(url)) return true;
  return false;
}

export async function executeAgentInspect(input: {
  readonly payload: unknown;
  readonly projectRoot: string | null;
  readonly ownerId: number;
  readonly senderAllowed: boolean;
}): Promise<AgentExecResult> {
  if (clearing) await clearing;
  if (!input.senderAllowed) return failResult("sender_not_allowed", input.ownerId);
  if (inFlight >= AGENT_EXECUTION_MAX_CONCURRENCY) {
    return failResult("operation_in_progress", input.ownerId);
  }
  if (typeof input.projectRoot !== "string" || input.projectRoot.length === 0) {
    return failResult("no_project", input.ownerId);
  }
  const planned: AgentInspectDecision = parseAgentInspectRequest(input.payload);
  if (!planned.ok) {
    recordDenial(planned.executionClass, planned.code, planned.message, input.ownerId);
    return {
      ok: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
      timedOut: false,
      truncated: false,
      error: planned.message,
      code: planned.code,
    };
  }

  const projectKind = await lstatKind(input.projectRoot);
  if (projectKind === "symlink") return failResult("symlink_escape", input.ownerId);
  if (projectKind !== "dir") return failResult("no_project", input.ownerId);
  const canonicalRoot = realpathOrNull(input.projectRoot);
  if (!canonicalRoot) return failResult("no_project", input.ownerId);
  if (isForbiddenAgentLocation(canonicalRoot)) return failResult("outside_root", input.ownerId);
  if ((await lstatKind(canonicalRoot)) !== "dir") return failResult("symlink_escape", input.ownerId);

  const executable = resolveTrustedExecutable(planned.executable, canonicalRoot);
  if (!executable) return failResult("executable_not_allowed", input.ownerId);

  if (testRuntime.beforeSpawn) await testRuntime.beforeSpawn();
  if (!identityMatches(executable)) {
    return failResult("executable_identity_changed", input.ownerId);
  }

  const epochAtStart = sessionEpoch;
  inFlight += 1;
  const start = Date.now();
  let stdout = "";
  let stderr = "";
  let truncated = false;
  let timedOut = false;
  const timeoutMs = testRuntime.timeoutMs ?? AGENT_COMMAND_TIMEOUT_MS;
  const cap = testRuntime.maxOutputChars ?? AGENT_COMMAND_OUTPUT_CHARS;

  try {
    const result = await new Promise<AgentExecResult>((resolve) => {
      const child = spawn(executable.real, [...planned.argv], {
        cwd: canonicalRoot,
        env: buildAgentExecutionEnv(path.dirname(executable.real)),
        windowsHide: true,
        shell: false,
        detached: false,
      });
      if (typeof child.pid === "number") activePid = child.pid;
      const timer = setTimeout(() => {
        timedOut = true;
        if (typeof child.pid === "number") {
          void terminateTrackedPids([child.pid], { termGraceMs: 200 });
        } else {
          child.kill("SIGTERM");
        }
      }, timeoutMs);
      const append = (dest: "out" | "err", chunk: Buffer) => {
        const text = chunk.toString("utf8");
        if (dest === "out") {
          const next = stdout + text;
          if (next.length > cap) {
            truncated = true;
            stdout = next.slice(0, cap);
          } else stdout = next;
        } else {
          const next = stderr + text;
          if (next.length > cap) {
            truncated = true;
            stderr = next.slice(0, cap);
          } else stderr = next;
        }
      };
      child.stdout?.on("data", (chunk: Buffer) => append("out", chunk));
      child.stderr?.on("data", (chunk: Buffer) => append("err", chunk));
      child.on("error", (err) => {
        clearTimeout(timer);
        resolve({
          ok: false,
          exitCode: null,
          stdout: redactSensitiveText(stdout).slice(0, cap),
          stderr: redactSensitiveText(stderr).slice(0, cap),
          durationMs: Date.now() - start,
          timedOut,
          truncated,
          error: formatPosixSpawnError(err),
          code: "generic_failure",
        });
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        const exitCode = typeof code === "number" ? code : null;
        let resultCode: AgentExecutionFailureCode | undefined;
        if (sessionEpoch !== epochAtStart) resultCode = "project_changed";
        else if (timedOut) resultCode = "timeout";
        else if (truncated) resultCode = "output_limit";
        resolve({
          ok: exitCode === 0 && !timedOut && !truncated && !resultCode,
          exitCode,
          stdout: redactSensitiveText(stdout).slice(0, cap),
          stderr: redactSensitiveText(stderr).slice(0, cap),
          durationMs: Date.now() - start,
          timedOut,
          truncated,
          error: resultCode ? agentExecutionFailureMessage(resultCode) : undefined,
          code: resultCode,
        });
      });
    });
    if (!result.ok && result.code) {
      recordDenial(
        "agent_readonly_inspect",
        result.code,
        result.error ?? agentExecutionFailureMessage(result.code),
        input.ownerId,
      );
    }
    return result;
  } finally {
    inFlight = Math.max(0, inFlight - 1);
    activePid = null;
  }
}

export function registerTerminalExecIpc(
  ipcMain: IpcMain,
  _isWithinProject: (target: string) => boolean,
  getProjectRoot: () => string | null,
  getMainWindow: () => BrowserWindow | null = () => BrowserWindow.getFocusedWindow(),
): void {
  ipcMain.handle("agent:inspect", async (event, payload: unknown): Promise<AgentExecResult> => {
    const allowed = isAgentExecutionSenderAllowed(event, getMainWindow);
    return executeAgentInspect({
      payload,
      projectRoot: getProjectRoot(),
      ownerId: event.sender.id,
      senderAllowed: allowed,
    });
  });

  ipcMain.handle("agent:executionPolicy", async (event) => {
    if (!isAgentExecutionSenderAllowed(event, getMainWindow)) return null;
    return inspectAgentExecutionPolicy();
  });

  ipcMain.handle("agent:executionDenials", async (event) => {
    if (!isAgentExecutionSenderAllowed(event, getMainWindow)) return [];
    return listAgentExecutionDenials(event.sender.id);
  });
}
