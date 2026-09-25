import { spawn, execFileSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
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
  PACKAGE_SCRIPT_APPROVAL_TTL_MS,
  PACKAGE_SCRIPT_BODY_MAX_CHARS,
  PACKAGE_SCRIPT_ENVIRONMENT_TEXT,
  PROJECT_CODE_APPROVAL_TTL_MS,
  PROJECT_CODE_NETWORK_LIMITATION,
  PROJECT_CODE_PATH_BEHAVIOR,
  PROJECT_CODE_RISK_TEXT,
  agentEnvKeyForbidden,
  agentExecutionFailureMessage,
  buildAgentExecutionPolicySnapshot,
  isForbiddenAgentLocation,
  PACKAGE_SCRIPT_POSIX_ARGV,
  PACKAGE_SCRIPT_WINDOWS_ARGV,
  isTrustedWindowsSystemShellPath,
  packageScriptPlanKey,
  packageScriptShellWarning,
  parseAgentInspectRequest,
  parsePackageScriptExecutionToken,
  parseProjectCodeExecutionToken,
  planPackageScriptRequest,
  planProjectCodeRequest,
  projectCodeEnvironmentPolicyKey,
  redactSensitiveText,
  type AgentExecutableIdentity,
  type AgentExecutionApprovalRecord,
  type AgentExecutionClass,
  type AgentExecutionDenialRecord,
  type AgentExecutionFailureCode,
  type AgentExecutionPolicySnapshot,
  type AgentInspectDecision,
  type AgentProjectCodePlan,
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
  approvalTtlMs?: number;
  allowTmpExecutables?: boolean;
  executableOverrides?: Partial<Record<AgentExecutableIdentity, string>>;
  beforeSpawn?: () => Promise<void> | void;
  trustedDecision?: () => Promise<"approve" | "cancel">;
  platform?: "win32" | "darwin" | "linux";
  windowsShellFixture?: string;
  holdToken?: (token: string) => void;
  snapshotRoot?: string;
  afterSeal?: () => Promise<void> | void;
}

const denialsByOwner = new Map<number, AgentExecutionDenialRecord[]>();
const approvalsByOwner = new Map<number, AgentExecutionApprovalRecord[]>();
let sessionEpoch = 0;
let inFlight = 0;
let activePid: number | null = null;
let activeOwnerId: number | null = null;
let cancelRequested = false;
let clearing: Promise<void> | null = null;
let testRuntime: Runtime = {};

interface ScriptIdentity {
  readonly canonicalPath: string;
  readonly fileType: "regular";
  readonly dev: number;
  readonly ino: number;
  readonly size: number;
  readonly mtimeMs: number;
  readonly sha256: string;
}

interface ProjectCodeBinding {
  readonly id: string;
  readonly ownerId: number;
  readonly sessionEpoch: number;
  readonly canonicalRoot: string;
  readonly activeProject: string;
  readonly request: { readonly script: string; readonly args: readonly string[] };
  readonly planKey: string;
  readonly environmentPolicyKey: string;
  readonly timeoutMs: number;
  readonly executableReal: string;
  readonly executableDev: number;
  readonly executableIno: number;
  readonly executableMtimeMs: number;
  readonly executableSize: number;
  readonly scriptIdentity: ScriptIdentity;
  readonly snapshotPath: string | null;
  readonly expiresAt: number;
}

let activeSnapshotPath: string | null = null;
let activeSnapshotHandle: import("node:fs/promises").FileHandle | null = null;

const projectCodePreviews = new Map<string, ProjectCodeBinding>();
const projectCodeTokens = new Map<string, ProjectCodeBinding>();
const packageScriptPreviews = new Map<string, PackageScriptBinding>();
const packageScriptTokens = new Map<string, PackageScriptBinding>();
let activePackageScriptConfirm: BrowserWindow | null = null;

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

function recordApproval(
  outcome: "approved" | "denied",
  code: string,
  reason: string,
  ownerId: number,
  executionClass: AgentExecutionClass = "user_approved_project_code",
): void {
  const row: AgentExecutionApprovalRecord = {
    at: nowMs(),
    outcome,
    code,
    executionClass,
    reason: redactSensitiveText(reason).slice(0, 240),
    ownerId,
  };
  const list = approvalsByOwner.get(ownerId) ?? [];
  list.unshift(row);
  while (list.length > AGENT_DENIAL_LOG_LIMIT) list.pop();
  approvalsByOwner.set(ownerId, list);
}

export function listAgentExecutionApprovals(ownerId?: number): readonly AgentExecutionApprovalRecord[] {
  if (typeof ownerId !== "number") return [];
  return (approvalsByOwner.get(ownerId) ?? []).slice(0, AGENT_DENIAL_LOG_LIMIT);
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
  const systemNpm =
    normalized.startsWith("/usr/local/lib/node_modules/npm/") ||
    normalized.startsWith("/opt/homebrew/lib/node_modules/npm/") ||
    normalized.startsWith("/usr/lib/node_modules/npm/");
  if (normalized.includes("/node_modules/") && !systemNpm) return true;
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
  packageScriptPreviews.clear();
  packageScriptTokens.clear();
  const snapshotAtClear = activeSnapshotPath;
  activeSnapshotPath = null;
  const pid = activePid;
  activePid = null;
  const epoch = sessionEpoch;
  clearing = (async () => {
    if (typeof pid === "number") {
      await terminateTrackedPids([pid], { termGraceMs: 200 });
    }
    await closeActiveSnapshotHandle();
    await discardProjectCodeSnapshot(snapshotAtClear);
    await recoverProjectCodeSnapshots();
    if (sessionEpoch === epoch) {
      inFlight = 0;
      activePid = null;
      activeOwnerId = null;
      cancelRequested = false;
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

function projectCodeFailure(
  code: AgentExecutionFailureCode,
  ownerId: number,
): AgentExecResult {
  const message = agentExecutionFailureMessage(code);
  recordDenial("user_approved_project_code", code, message, ownerId);
  recordApproval("denied", code, message, ownerId);
  return {
    ok: false,
    exitCode: null,
    stdout: "",
    stderr: "",
    durationMs: 0,
    timedOut: code === "timeout",
    truncated: code === "output_limit",
    error: message,
    code,
  };
}

async function resolveCanonicalProject(projectRoot: string | null): Promise<
  | { readonly ok: true; readonly canonicalRoot: string }
  | { readonly ok: false; readonly code: AgentExecutionFailureCode }
> {
  if (typeof projectRoot !== "string" || projectRoot.length === 0) return { ok: false, code: "no_project" };
  const projectKind = await lstatKind(projectRoot);
  if (projectKind === "symlink") return { ok: false, code: "symlink_escape" };
  if (projectKind !== "dir") return { ok: false, code: "no_project" };
  const canonicalRoot = realpathOrNull(projectRoot);
  if (!canonicalRoot) return { ok: false, code: "no_project" };
  if (isForbiddenAgentLocation(canonicalRoot)) return { ok: false, code: "outside_root" };
  if ((await lstatKind(canonicalRoot)) !== "dir") return { ok: false, code: "symlink_escape" };
  return { ok: true, canonicalRoot };
}

function sameScriptIdentity(left: ScriptIdentity, right: ScriptIdentity): boolean {
  return (
    left.canonicalPath === right.canonicalPath &&
    left.fileType === right.fileType &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.sha256 === right.sha256
  );
}

async function captureScriptIdentity(
  canonicalRoot: string,
  script: string,
): Promise<
  | { readonly ok: true; readonly identity: ScriptIdentity; readonly bytes: Buffer }
  | { readonly ok: false; readonly code: AgentExecutionFailureCode }
> {
  const absolute = path.resolve(canonicalRoot, script);
  if (!isCanonicalPathWithinRoot(canonicalRoot, absolute)) return { ok: false, code: "outside_root" };
  let listed;
  try {
    listed = await fs.lstat(absolute);
  } catch {
    return { ok: false, code: "executable_not_allowed" };
  }
  if (listed.isSymbolicLink()) return { ok: false, code: "symlink_escape" };
  if (!listed.isFile()) return { ok: false, code: "executable_not_allowed" };
  const real = realpathOrNull(absolute);
  if (!real || !isCanonicalPathWithinRoot(canonicalRoot, real)) return { ok: false, code: "symlink_escape" };
  let before;
  try {
    before = await fs.lstat(real);
  } catch {
    return { ok: false, code: "script_identity_changed" };
  }
  if (before.isSymbolicLink() || !before.isFile()) return { ok: false, code: "script_identity_changed" };
  const bytes = await fs.readFile(real);
  let after;
  try {
    after = await fs.lstat(real);
  } catch {
    return { ok: false, code: "script_identity_changed" };
  }
  if (
    after.isSymbolicLink() ||
    !after.isFile() ||
    after.dev !== before.dev ||
    after.ino !== before.ino ||
    after.size !== before.size ||
    after.mtimeMs !== before.mtimeMs
  ) {
    return { ok: false, code: "script_identity_changed" };
  }
  return {
    ok: true,
    bytes,
    identity: {
      canonicalPath: real,
      fileType: "regular",
      dev: after.dev,
      ino: after.ino,
      size: after.size,
      mtimeMs: after.mtimeMs,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    },
  };
}

function snapshotDirectory(): string {
  if (typeof testRuntime.snapshotRoot === "string" && testRuntime.snapshotRoot.length > 0) {
    return testRuntime.snapshotRoot;
  }
  try {
    return path.join(app.getPath("userData"), "agent-execution-snapshots");
  } catch {
    return path.join(os.tmpdir(), "bryantlabs-agent-execution-snapshots");
  }
}

async function ensureSnapshotDirectory(projectRoot: string | null): Promise<string | null> {
  const dir = snapshotDirectory();
  await fs.mkdir(dir, { recursive: true, mode: 0o700 });
  const listed = await fs.lstat(dir);
  if (listed.isSymbolicLink() || !listed.isDirectory()) return null;
  const real = realpathOrNull(dir);
  if (!real) return null;
  if (projectRoot && (real === projectRoot || real.startsWith(`${projectRoot}${path.sep}`))) return null;
  await fs.chmod(real, 0o700);
  return real;
}

function setSnapshotImmutable(filePath: string, immutable: boolean): boolean {
  if (process.platform !== "darwin") return true;
  try {
    execFileSync("/usr/bin/chflags", [immutable ? "uchg" : "nouchg", filePath], { timeout: 2_000 });
    return true;
  } catch {
    return false;
  }
}

export async function discardProjectCodeSnapshot(filePath: string | null): Promise<void> {
  if (!filePath) return;
  const root = realpathOrNull(snapshotDirectory());
  const real = realpathOrNull(filePath);
  if (!root || !real || (real !== root && !real.startsWith(`${root}${path.sep}`))) return;
  let listed;
  try {
    listed = await fs.lstat(real);
  } catch {
    return;
  }
  if (listed.isSymbolicLink() || !listed.isFile()) return;
  setSnapshotImmutable(real, false);
  await fs.unlink(real).catch(() => undefined);
}

async function closeActiveSnapshotHandle(): Promise<void> {
  const handle = activeSnapshotHandle;
  activeSnapshotHandle = null;
  if (handle) await handle.close().catch(() => undefined);
}

export async function recoverProjectCodeSnapshots(): Promise<void> {
  packageScriptPreviews.clear();
  packageScriptTokens.clear();
  if (activePackageScriptConfirm && !activePackageScriptConfirm.isDestroyed()) {
    activePackageScriptConfirm.close();
  }
  activePackageScriptConfirm = null;
  await closeActiveSnapshotHandle();
  const pending = activeSnapshotPath;
  activeSnapshotPath = null;
  await discardProjectCodeSnapshot(pending);
  for (const binding of projectCodeTokens.values()) {
    await discardProjectCodeSnapshot(binding.snapshotPath);
  }
  for (const binding of projectCodePreviews.values()) {
    await discardProjectCodeSnapshot(binding.snapshotPath);
  }
  const root = await ensureSnapshotDirectory(null);
  if (!root) return;
  const names = await fs.readdir(root).catch(() => [] as string[]);
  for (const name of names) {
    await discardProjectCodeSnapshot(path.join(root, name));
  }
}

async function sealApprovedBytes(
  bytes: Buffer,
  expectedHash: string,
  extension: string,
  projectRoot: string,
): Promise<{ readonly ok: true; readonly snapshotPath: string } | { readonly ok: false; readonly code: AgentExecutionFailureCode }> {
  const actual = createHash("sha256").update(bytes).digest("hex");
  if (actual !== expectedHash) return { ok: false, code: "script_identity_changed" };
  const root = await ensureSnapshotDirectory(projectRoot);
  if (!root) return { ok: false, code: "outside_root" };
  const snapshotPath = path.join(root, `${randomBytes(16).toString("hex")}${extension}`);
  const flags = constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW ?? 0);
  let writer: import("node:fs/promises").FileHandle;
  try {
    writer = await fs.open(snapshotPath, flags, 0o600);
  } catch {
    return { ok: false, code: "script_identity_changed" };
  }
  try {
    await writer.write(bytes);
    await writer.sync();
    await writer.chmod(0o400);
  } catch {
    await writer.close().catch(() => undefined);
    await discardProjectCodeSnapshot(snapshotPath);
    return { ok: false, code: "script_identity_changed" };
  }
  await writer.close();
  if (!setSnapshotImmutable(snapshotPath, true)) {
    await discardProjectCodeSnapshot(snapshotPath);
    return { ok: false, code: "script_identity_changed" };
  }
  const verified = await hashSnapshotFd(snapshotPath);
  if (!verified || verified.hash !== expectedHash || !verified.bytes.equals(bytes)) {
    await discardProjectCodeSnapshot(snapshotPath);
    return { ok: false, code: "script_identity_changed" };
  }
  await verified.handle.close();
  return { ok: true, snapshotPath };
}

async function hashSnapshotFd(
  snapshotPath: string,
): Promise<{ readonly handle: import("node:fs/promises").FileHandle; readonly hash: string; readonly bytes: Buffer } | null> {
  const flags = constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0);
  let handle: import("node:fs/promises").FileHandle;
  try {
    handle = await fs.open(snapshotPath, flags);
  } catch {
    return null;
  }
  const listed = await handle.stat();
  if (!listed.isFile()) {
    await handle.close();
    return null;
  }
  const bytes = Buffer.alloc(listed.size);
  await handle.read(bytes, 0, listed.size, 0);
  const again = await handle.stat();
  if (again.ino !== listed.ino || again.size !== listed.size || again.mtimeMs !== listed.mtimeMs) {
    await handle.close();
    return null;
  }
  return { handle, hash: createHash("sha256").update(bytes).digest("hex"), bytes };
}

function rebuildProjectPlan(
  request: { readonly script: string; readonly args: readonly string[] },
  expectedPlanKey: string,
): AgentProjectCodePlan | AgentExecResult {
  const planned = planProjectCodeRequest({ script: request.script, args: [...request.args] });
  if (!planned.ok) {
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
  if (planned.planKey !== expectedPlanKey) {
    return {
      ok: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
      timedOut: false,
      truncated: false,
      error: agentExecutionFailureMessage("approval_invalid"),
      code: "approval_invalid",
    };
  }
  return planned;
}

function bindingFresh(binding: ProjectCodeBinding, ownerId: number, canonicalRoot: string): AgentExecutionFailureCode | null {
  if (binding.ownerId !== ownerId) return "approval_invalid";
  if (binding.sessionEpoch !== sessionEpoch) return "project_changed";
  if (binding.canonicalRoot !== canonicalRoot || binding.activeProject !== canonicalRoot) return "project_changed";
  if (binding.expiresAt <= nowMs()) return "approval_expired";
  if (binding.environmentPolicyKey !== projectCodeEnvironmentPolicyKey()) return "environment_not_allowed";
  if (binding.timeoutMs !== (testRuntime.timeoutMs ?? AGENT_COMMAND_TIMEOUT_MS)) return "approval_invalid";
  return null;
}

export async function prepareProjectCodeApproval(input: {
  readonly payload: unknown;
  readonly projectRoot: string | null;
  readonly ownerId: number;
  readonly senderAllowed: boolean;
}): Promise<
  | {
      readonly ok: true;
      readonly previewId: string;
      readonly executable: string;
      readonly arguments: readonly string[];
      readonly workingDirectory: string;
      readonly networkLimitation: string;
      readonly timeoutMs: number;
      readonly risk: string;
    }
  | AgentExecResult
> {
  if (clearing) await clearing;
  if (!input.senderAllowed) return projectCodeFailure("sender_not_allowed", input.ownerId);
  const project = await resolveCanonicalProject(input.projectRoot);
  if (!project.ok) return projectCodeFailure(project.code, input.ownerId);
  const planned = planProjectCodeRequest(input.payload);
  if (!planned.ok) {
    recordDenial(planned.executionClass, planned.code, planned.message, input.ownerId);
    recordApproval("denied", planned.code, planned.message, input.ownerId);
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
  const script = planned.argv[0] ?? "";
  const args = planned.argv.slice(1);
  const captured = await captureScriptIdentity(project.canonicalRoot, script);
  if (!captured.ok) return projectCodeFailure(captured.code, input.ownerId);
  const executable = resolveTrustedExecutable("node", project.canonicalRoot);
  if (!executable) return projectCodeFailure("executable_not_allowed", input.ownerId);
  const executableStat = captureIdentity("node", executable.resolved);
  if (!executableStat) return projectCodeFailure("executable_not_allowed", input.ownerId);
  const previewId = randomBytes(16).toString("hex");
  const ttl = testRuntime.approvalTtlMs ?? PROJECT_CODE_APPROVAL_TTL_MS;
  const timeoutMs = testRuntime.timeoutMs ?? planned.timeoutMs;
  projectCodePreviews.set(previewId, {
    id: previewId,
    ownerId: input.ownerId,
    sessionEpoch,
    canonicalRoot: project.canonicalRoot,
    activeProject: project.canonicalRoot,
    request: { script, args },
    planKey: planned.planKey,
    environmentPolicyKey: projectCodeEnvironmentPolicyKey(),
    timeoutMs,
    executableReal: executable.real,
    executableDev: Number(executableStat.ino.split(":")[0]),
    executableIno: Number(executableStat.ino.split(":")[1]),
    executableMtimeMs: executableStat.mtimeMs,
    executableSize: executableStat.size,
    scriptIdentity: captured.identity,
    snapshotPath: null,
    expiresAt: nowMs() + Math.max(0, ttl),
  });
  return {
    ok: true,
    previewId,
    executable: executable.real,
    arguments: [...planned.argv],
    workingDirectory: project.canonicalRoot,
    networkLimitation: PROJECT_CODE_NETWORK_LIMITATION,
    timeoutMs: planned.timeoutMs,
    risk: PROJECT_CODE_RISK_TEXT,
  };
}

/** Renderer IPC must not mint approval. Only the main-owned confirmation window can. */
export async function approveProjectCodePreview(input: {
  readonly previewId: unknown;
  readonly projectRoot: string | null;
  readonly ownerId: number;
  readonly senderAllowed: boolean;
}): Promise<AgentExecResult> {
  void input.previewId;
  void input.projectRoot;
  if (!input.senderAllowed) return projectCodeFailure("sender_not_allowed", input.ownerId);
  return projectCodeFailure("approval_invalid", input.ownerId);
}

export async function executeApprovedProjectCode(input: {
  readonly payload: unknown;
  readonly projectRoot: string | null;
  readonly ownerId: number;
  readonly senderAllowed: boolean;
}): Promise<AgentExecResult> {
  if (clearing) await clearing;
  if (!input.senderAllowed) return projectCodeFailure("sender_not_allowed", input.ownerId);
  if (inFlight >= AGENT_EXECUTION_MAX_CONCURRENCY) return projectCodeFailure("operation_in_progress", input.ownerId);
  const parsed = parseProjectCodeExecutionToken(input.payload);
  if (!parsed.ok) {
    if (input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)) {
      const presented = (input.payload as { token?: unknown }).token;
      if (typeof presented === "string" && /^[a-f0-9]{32}$/.test(presented)) {
        projectCodeTokens.delete(presented);
      }
    }
    recordDenial(parsed.executionClass, parsed.code, parsed.message, input.ownerId);
    recordApproval("denied", parsed.code, parsed.message, input.ownerId);
    return {
      ok: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
      timedOut: false,
      truncated: false,
      error: parsed.message,
      code: parsed.code,
    };
  }
  const project = await resolveCanonicalProject(input.projectRoot);
  if (!project.ok) return projectCodeFailure(project.code, input.ownerId);
  const token = projectCodeTokens.get(parsed.token);
  projectCodeTokens.delete(parsed.token);
  if (!token) return projectCodeFailure("approval_invalid", input.ownerId);
  const failAndDiscard = async (code: AgentExecutionFailureCode): Promise<AgentExecResult> => {
    await discardProjectCodeSnapshot(token.snapshotPath);
    return projectCodeFailure(code, input.ownerId);
  };
  const stale = bindingFresh(token, input.ownerId, project.canonicalRoot);
  if (stale) return failAndDiscard(stale);
  const rebuilt = rebuildProjectPlan(token.request, token.planKey);
  if (!("planKey" in rebuilt)) {
    await discardProjectCodeSnapshot(token.snapshotPath);
    recordDenial("user_approved_project_code", rebuilt.code ?? "approval_invalid", rebuilt.error ?? "invalid", input.ownerId);
    recordApproval("denied", rebuilt.code ?? "approval_invalid", rebuilt.error ?? "invalid", input.ownerId);
    return rebuilt;
  }
  const executable = resolveTrustedExecutable("node", project.canonicalRoot);
  if (
    !executable ||
    executable.real !== token.executableReal ||
    executable.ino !== `${token.executableDev}:${token.executableIno}` ||
    executable.mtimeMs !== token.executableMtimeMs ||
    executable.size !== token.executableSize
  ) {
    return failAndDiscard("executable_identity_changed");
  }
  if (!token.snapshotPath) return failAndDiscard("approval_invalid");
  if (testRuntime.beforeSpawn) await testRuntime.beforeSpawn();
  if (!identityMatches(executable)) return failAndDiscard("executable_identity_changed");
  const opened = await hashSnapshotFd(token.snapshotPath);
  if (!opened || opened.hash !== token.scriptIdentity.sha256) {
    await opened?.handle.close().catch(() => undefined);
    await discardProjectCodeSnapshot(token.snapshotPath);
    return projectCodeFailure("script_identity_changed", input.ownerId);
  }
  activeSnapshotHandle = opened.handle;
  activeSnapshotPath = token.snapshotPath;
  if (testRuntime.afterSeal) await testRuntime.afterSeal();
  const rebound = bindingFresh(token, input.ownerId, project.canonicalRoot);
  if (rebound) return projectCodeFailure(rebound, input.ownerId);
  if (sessionEpoch !== token.sessionEpoch || token.canonicalRoot !== project.canonicalRoot) {
    return projectCodeFailure("project_changed", input.ownerId);
  }

  const epochAtStart = sessionEpoch;
  const rootAtStart = project.canonicalRoot;
  cancelRequested = false;
  inFlight += 1;
  activeOwnerId = input.ownerId;
  const start = Date.now();
  let stdout = "";
  let stderr = "";
  let truncated = false;
  let timedOut = false;
  const timeoutMs = token.timeoutMs;
  const cap = testRuntime.maxOutputChars ?? AGENT_COMMAND_OUTPUT_CHARS;

  try {
    const result = await new Promise<AgentExecResult>((resolve) => {
      const child = spawn(executable.real, ["/dev/fd/3", ...token.request.args], {
        cwd: rootAtStart,
        env: buildAgentExecutionEnv(path.dirname(executable.real)),
        windowsHide: true,
        shell: false,
        detached: false,
        stdio: ["ignore", "pipe", "pipe", opened.handle.fd],
      });
      if (typeof child.pid === "number") activePid = child.pid;
      const timer = setTimeout(() => {
        timedOut = true;
        if (typeof child.pid === "number") void terminateTrackedPids([child.pid], { termGraceMs: 200 });
        else child.kill("SIGTERM");
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
        if (truncated && typeof child.pid === "number") {
          void terminateTrackedPids([child.pid], { termGraceMs: 200 });
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
        else if (cancelRequested) resultCode = "cancelled";
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
      recordDenial("user_approved_project_code", result.code, result.error ?? agentExecutionFailureMessage(result.code), input.ownerId);
      recordApproval("denied", result.code, result.error ?? agentExecutionFailureMessage(result.code), input.ownerId);
    }
    return result;
  } finally {
    inFlight = Math.max(0, inFlight - 1);
    activePid = null;
    activeOwnerId = null;
    const snapshot = activeSnapshotPath;
    activeSnapshotPath = null;
    await closeActiveSnapshotHandle();
    await discardProjectCodeSnapshot(snapshot);
  }
}

export async function cancelProjectCodeApproval(input: {
  readonly previewId?: unknown;
  readonly token?: unknown;
  readonly ownerId: number;
  readonly senderAllowed: boolean;
}): Promise<{ readonly ok: true } | AgentExecResult> {
  if (!input.senderAllowed) return projectCodeFailure("sender_not_allowed", input.ownerId);
  if (typeof input.previewId === "string") {
    const preview = projectCodePreviews.get(input.previewId);
    if (preview && preview.ownerId === input.ownerId) projectCodePreviews.delete(input.previewId);
  }
  if (typeof input.token === "string") {
    const token = projectCodeTokens.get(input.token);
    if (token && token.ownerId === input.ownerId) projectCodeTokens.delete(input.token);
  }
  if (activeOwnerId === input.ownerId) {
    cancelRequested = true;
    const pid = activePid;
    if (typeof pid === "number") await terminateTrackedPids([pid], { termGraceMs: 200 });
  }
  recordApproval("denied", "cancelled", "User cancelled project-code approval.", input.ownerId);
  return { ok: true };
}

interface OpenChallenge {
  readonly nonce: string;
  resolve: (decision: "approve" | "cancel") => void;
}

const openChallenges = new Map<number, OpenChallenge>();

export function acceptProjectCodeChallenge(
  senderId: number,
  payload: unknown,
): void {
  const challenge = openChallenges.get(senderId);
  if (!challenge) return;
  const record = payload && typeof payload === "object" ? (payload as { nonce?: unknown; decision?: unknown }) : {};
  if (record.nonce !== challenge.nonce) return;
  if (record.decision !== "approve" && record.decision !== "cancel") return;
  openChallenges.delete(senderId);
  challenge.resolve(record.decision);
}

async function askTrustedConfirmation(
  binding: ProjectCodeBinding,
  parentWindow: BrowserWindow | null,
): Promise<"approve" | "cancel"> {
  if (testRuntime.trustedDecision) return testRuntime.trustedDecision();
  const nonce = randomBytes(16).toString("hex");
  const win = new BrowserWindow({
    parent: parentWindow ?? undefined,
    modal: Boolean(parentWindow),
    width: 640,
    height: 520,
    show: true,
    title: "Approve project code",
    webPreferences: {
      preload: path.join(__dirname, "projectCodeConfirmPreload.cjs"),
      additionalArguments: [`--project-code-nonce=${nonce}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => {
    event.preventDefault();
  });
  win.webContents.on("will-redirect", (event) => {
    event.preventDefault();
  });
  const senderId = win.webContents.id;
  const decision = await new Promise<"approve" | "cancel">((resolve) => {
    openChallenges.set(senderId, { nonce, resolve });
    win.on("closed", () => {
      if (openChallenges.delete(senderId)) resolve("cancel");
    });
    win.webContents.once("did-finish-load", () => {
      if (win.isDestroyed()) return;
      win.webContents.send("project-code-confirm-details", {
        pathBehavior: PROJECT_CODE_PATH_BEHAVIOR,
        executable: binding.executableReal,
        arguments: binding.request.args.join(" "),
        workingDirectory: binding.canonicalRoot,
        networkLimitation: PROJECT_CODE_NETWORK_LIMITATION,
        timeout: `${binding.timeoutMs}ms`,
        digest: binding.scriptIdentity.sha256,
        risk: PROJECT_CODE_RISK_TEXT,
      });
    });
    void win.loadFile(path.join(__dirname, "projectCodeConfirm.html"));
  });
  if (!win.isDestroyed()) win.close();
  return decision;
}

export async function runTrustedProjectCodeConfirmation(input: {
  readonly previewId: unknown;
  readonly projectRoot: string | null;
  readonly ownerId: number;
  readonly senderAllowed: boolean;
  readonly parentWindow?: BrowserWindow | null;
}): Promise<AgentExecResult | { readonly ok: true; readonly held: true }> {
  if (clearing) await clearing;
  if (!input.senderAllowed) return projectCodeFailure("sender_not_allowed", input.ownerId);
  if (typeof input.previewId !== "string" || !/^[a-f0-9]{32}$/.test(input.previewId)) {
    return projectCodeFailure("approval_invalid", input.ownerId);
  }
  const preview = projectCodePreviews.get(input.previewId);
  if (!preview || !projectCodePreviews.delete(input.previewId)) {
    return projectCodeFailure("approval_invalid", input.ownerId);
  }
  const decision = await askTrustedConfirmation(preview, input.parentWindow ?? null);
  if (decision !== "approve") {
    return projectCodeFailure("cancelled", input.ownerId);
  }
  const project = await resolveCanonicalProject(input.projectRoot);
  if (!project.ok) return projectCodeFailure(project.code, input.ownerId);
  const stale = bindingFresh(preview, input.ownerId, project.canonicalRoot);
  if (stale) return projectCodeFailure(stale, input.ownerId);
  const rebuilt = rebuildProjectPlan(preview.request, preview.planKey);
  if (!("planKey" in rebuilt)) {
    recordDenial("user_approved_project_code", rebuilt.code ?? "approval_invalid", rebuilt.error ?? "invalid", input.ownerId);
    recordApproval("denied", rebuilt.code ?? "approval_invalid", rebuilt.error ?? "invalid", input.ownerId);
    return rebuilt;
  }
  const recaptured = await captureScriptIdentity(project.canonicalRoot, preview.request.script);
  if (!recaptured.ok) return projectCodeFailure(recaptured.code, input.ownerId);
  if (!sameScriptIdentity(recaptured.identity, preview.scriptIdentity)) {
    return projectCodeFailure("script_identity_changed", input.ownerId);
  }
  const executable = resolveTrustedExecutable("node", project.canonicalRoot);
  if (!executable || executable.real !== preview.executableReal || !identityMatches(executable)) {
    return projectCodeFailure("executable_identity_changed", input.ownerId);
  }
  const extension = path.extname(preview.request.script).toLowerCase();
  const sealed = await sealApprovedBytes(
    recaptured.bytes,
    preview.scriptIdentity.sha256,
    extension.length > 0 ? extension : ".js",
    project.canonicalRoot,
  );
  if (!sealed.ok) return projectCodeFailure(sealed.code, input.ownerId);
  const token = randomBytes(16).toString("hex");
  const ttl = testRuntime.approvalTtlMs ?? PROJECT_CODE_APPROVAL_TTL_MS;
  projectCodeTokens.set(token, {
    ...preview,
    id: token,
    scriptIdentity: recaptured.identity,
    snapshotPath: sealed.snapshotPath,
    expiresAt: nowMs() + Math.max(0, ttl),
    sessionEpoch,
    canonicalRoot: project.canonicalRoot,
    activeProject: project.canonicalRoot,
  });
  recordApproval("approved", "approved", "User approved project-code execution.", input.ownerId);
  if (testRuntime.holdToken) {
    testRuntime.holdToken(token);
    return { ok: true, held: true };
  }
  return executeApprovedProjectCode({
    payload: { token },
    projectRoot: input.projectRoot,
    ownerId: input.ownerId,
    senderAllowed: true,
  });
}

export async function rejectRendererProjectCodeRedemption(input: {
  readonly payload: unknown;
  readonly ownerId: number;
  readonly senderAllowed: boolean;
}): Promise<AgentExecResult> {
  if (!input.senderAllowed) return projectCodeFailure("sender_not_allowed", input.ownerId);
  if (input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)) {
    const presented = (input.payload as { token?: unknown }).token;
    if (typeof presented === "string") {
      const bound = projectCodeTokens.get(presented);
      projectCodeTokens.delete(presented);
      await discardProjectCodeSnapshot(bound?.snapshotPath ?? null);
    }
  }
  return projectCodeFailure("approval_invalid", input.ownerId);
}

interface PackageFileIdentity {
  readonly present: boolean;
  readonly canonicalPath: string;
  readonly dev: number;
  readonly ino: number;
  readonly size: number;
  readonly mtimeMs: number;
  readonly sha256: string;
}

interface DirectoryIdentity {
  readonly canonicalPath: string;
  readonly dev: number;
  readonly ino: number;
  readonly size: number;
  readonly mtimeMs: number;
  readonly sha256: string;
}

interface ShellIdentity {
  readonly requestedPath: string;
  readonly argvPrefix: readonly string[];
  readonly linkDev: number;
  readonly linkIno: number;
  readonly linkSize: number;
  readonly linkMtimeMs: number;
  readonly realPath: string;
  readonly dev: number;
  readonly ino: number;
  readonly size: number;
  readonly mtimeMs: number;
}

interface PackageScriptBinding {
  readonly id: string;
  readonly ownerId: number;
  readonly sessionEpoch: number;
  readonly canonicalRoot: string;
  readonly scriptName: "build" | "test" | "typecheck" | "lint";
  readonly scriptBody: string;
  readonly scriptBodySha256: string;
  readonly planKey: string;
  readonly pathValue: string;
  readonly environmentPolicyKey: string;
  readonly timeoutMs: number;
  readonly shell: ShellIdentity;
  readonly packageIdentity: PackageFileIdentity;
  readonly lockIdentity: PackageFileIdentity;
  readonly binIdentity: DirectoryIdentity;
  readonly expiresAt: number;
}

const ALTERNATE_LOCKFILES = ["yarn.lock", "pnpm-lock.yaml", "bun.lock", "bun.lockb", "npm-shrinkwrap.json"] as const;

function packageScriptFailure(code: AgentExecutionFailureCode, ownerId: number): AgentExecResult {
  const message = agentExecutionFailureMessage(code);
  recordDenial("user_approved_package_script", code, message, ownerId);
  recordApproval("denied", code, message, ownerId);
  return {
    ok: false,
    exitCode: null,
    stdout: "",
    stderr: "",
    durationMs: 0,
    timedOut: code === "timeout",
    truncated: code === "output_limit",
    error: message,
    code,
  };
}

function samePackageIdentity(left: PackageFileIdentity, right: PackageFileIdentity): boolean {
  return (
    left.present === right.present &&
    left.canonicalPath === right.canonicalPath &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.sha256 === right.sha256
  );
}

async function capturePackageFile(
  canonicalRoot: string,
  name: string,
  missingOk: boolean,
): Promise<{ readonly ok: true; readonly identity: PackageFileIdentity; readonly bytes: Buffer } | { readonly ok: false; readonly code: AgentExecutionFailureCode }> {
  const absolute = path.join(canonicalRoot, name);
  if (path.resolve(absolute) !== absolute) return { ok: false, code: "outside_root" };
  let listed;
  try {
    listed = await fs.lstat(absolute);
  } catch {
    if (!missingOk) return { ok: false, code: "no_project" };
    return {
      ok: true,
      bytes: Buffer.alloc(0),
      identity: { present: false, canonicalPath: absolute, dev: 0, ino: 0, size: 0, mtimeMs: 0, sha256: "" },
    };
  }
  if (listed.isSymbolicLink()) return { ok: false, code: "symlink_escape" };
  if (!listed.isFile()) return { ok: false, code: "invalid_request" };
  const captured = await captureScriptIdentity(canonicalRoot, name);
  if (!captured.ok) return captured;
  return {
    ok: true,
    bytes: captured.bytes,
    identity: {
      present: true,
      canonicalPath: captured.identity.canonicalPath,
      dev: captured.identity.dev,
      ino: captured.identity.ino,
      size: captured.identity.size,
      mtimeMs: captured.identity.mtimeMs,
      sha256: captured.identity.sha256,
    },
  };
}

async function rejectAlternateLockfiles(canonicalRoot: string): Promise<AgentExecutionFailureCode | null> {
  for (const name of ALTERNATE_LOCKFILES) {
    const absolute = path.join(canonicalRoot, name);
    try {
      await fs.lstat(absolute);
      return "executable_not_allowed";
    } catch {
      continue;
    }
  }
  return null;
}

function scriptBodyFromManifest(bytes: Buffer, scriptName: string): { readonly ok: true; readonly body: string } | { readonly ok: false; readonly code: AgentExecutionFailureCode } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bytes.toString("utf8"));
  } catch {
    return { ok: false, code: "invalid_request" };
  }
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return { ok: false, code: "invalid_request" };
  const scripts = (parsed as { scripts?: unknown }).scripts;
  if (scripts === null || typeof scripts !== "object" || Array.isArray(scripts)) return { ok: false, code: "execution_not_allowed" };
  const body = (scripts as Record<string, unknown>)[scriptName];
  if (typeof body !== "string" || body.length === 0 || body.length > PACKAGE_SCRIPT_BODY_MAX_CHARS) {
    return { ok: false, code: "execution_not_allowed" };
  }
  if (body.includes("\0")) return { ok: false, code: "arguments_not_allowed" };
  return { ok: true, body };
}

function packageScriptTestOverridesEnabled(): boolean {
  return typeof process.env.NODE_TEST_CONTEXT === "string" && process.env.NODE_TEST_CONTEXT.length > 0;
}

function executionPlatform(): "win32" | "posix" {
  const platform = packageScriptTestOverridesEnabled() ? testRuntime.platform ?? process.platform : process.platform;
  return platform === "win32" ? "win32" : "posix";
}

function shellInsideProject(real: string, projectRoot: string): boolean {
  return real === projectRoot || real.startsWith(`${projectRoot}${path.sep}`) || real.startsWith(`${projectRoot}/`);
}

function captureShellFile(requestedPath: string, argvPrefix: readonly string[], projectRoot: string): ShellIdentity | null {
  let link;
  try {
    link = lstatSync(requestedPath);
  } catch {
    return null;
  }
  if (link.isSymbolicLink() || !link.isFile()) return null;
  const real = realpathOrNull(requestedPath);
  if (!real || real !== requestedPath) return null;
  if (shellInsideProject(real, projectRoot) || isForbiddenAgentLocation(real)) return null;
  return {
    requestedPath,
    argvPrefix,
    linkDev: link.dev,
    linkIno: link.ino,
    linkSize: link.size,
    linkMtimeMs: link.mtimeMs,
    realPath: real,
    dev: link.dev,
    ino: link.ino,
    size: link.size,
    mtimeMs: link.mtimeMs,
  };
}

function captureTrustedPosixShell(projectRoot: string): ShellIdentity | null {
  const real = realpathOrNull("/bin/sh");
  if (!real) return null;
  if (!(real === "/bin/sh" || real === "/bin/bash" || real.startsWith("/bin/") || real.startsWith("/usr/bin/"))) return null;
  if (shellInsideProject(real, projectRoot) || isForbiddenAgentLocation(real)) return null;
  let link;
  try {
    link = lstatSync("/bin/sh");
  } catch {
    return null;
  }
  let file;
  try {
    file = lstatSync(real);
  } catch {
    return null;
  }
  if (file.isSymbolicLink() || !file.isFile()) return null;
  return {
    requestedPath: "/bin/sh",
    argvPrefix: PACKAGE_SCRIPT_POSIX_ARGV,
    linkDev: link.dev,
    linkIno: link.ino,
    linkSize: link.size,
    linkMtimeMs: link.mtimeMs,
    realPath: real,
    dev: file.dev,
    ino: file.ino,
    size: file.size,
    mtimeMs: file.mtimeMs,
  };
}

const CANONICAL_WINDOWS_ROOT = "C:\\Windows";
const CANONICAL_WINDOWS_REG = "C:\\Windows\\System32\\reg.exe";

function windowsInstallRoot(): string | null {
  if (process.platform !== "win32") return null;
  let link;
  try {
    link = lstatSync(CANONICAL_WINDOWS_REG);
  } catch {
    return null;
  }
  if (!link.isFile() || link.isSymbolicLink()) return null;
  if (realpathOrNull(CANONICAL_WINDOWS_REG) !== CANONICAL_WINDOWS_REG) return null;
  let output = "";
  try {
    output = execFileSync(
      CANONICAL_WINDOWS_REG,
      ["query", "HKLM\\SOFTWARE\\Microsoft\\Windows NT\\CurrentVersion", "/v", "SystemRoot"],
      {
        encoding: "utf8",
        windowsHide: true,
        shell: false,
        timeout: 5_000,
        env: {
          SystemRoot: CANONICAL_WINDOWS_ROOT,
          SYSTEMROOT: CANONICAL_WINDOWS_ROOT,
          WINDIR: CANONICAL_WINDOWS_ROOT,
          PATH: "C:\\Windows\\System32",
        },
      },
    );
  } catch {
    return null;
  }
  const match = output.match(/SystemRoot\s+REG_SZ\s+(\S+)/i);
  if (!match) return null;
  const reported = match[1].replace(/\//g, "\\").replace(/\\+$/, "");
  if (reported !== CANONICAL_WINDOWS_ROOT) return null;
  let rootStat;
  try {
    rootStat = lstatSync(reported);
  } catch {
    return null;
  }
  if (rootStat.isSymbolicLink()) return null;
  if (realpathOrNull(reported) !== CANONICAL_WINDOWS_ROOT) return null;
  return CANONICAL_WINDOWS_ROOT;
}

function windowsShellCandidates(): readonly string[] {
  const fixture = packageScriptTestOverridesEnabled() ? testRuntime.windowsShellFixture : undefined;
  if (typeof fixture === "string" && fixture.length > 0) return [fixture];
  const root = windowsInstallRoot();
  if (!root) return [];
  return ["System32", "Sysnative"].map((folder) => path.win32.join(root, folder, "cmd.exe"));
}

function captureTrustedWindowsShell(projectRoot: string): ShellIdentity | null {
  const fixture =
    packageScriptTestOverridesEnabled() &&
    typeof testRuntime.windowsShellFixture === "string" &&
    testRuntime.windowsShellFixture.length > 0;
  for (const candidate of windowsShellCandidates()) {
    if (fixture) {
      if (candidate.includes("\0") || !path.isAbsolute(candidate)) continue;
    } else if (!isTrustedWindowsSystemShellPath(candidate)) {
      continue;
    }
    const shell = captureShellFile(candidate, PACKAGE_SCRIPT_WINDOWS_ARGV, projectRoot);
    if (shell) return shell;
  }
  return null;
}

function captureTrustedShell(projectRoot: string): ShellIdentity | null {
  if (executionPlatform() === "win32") return captureTrustedWindowsShell(projectRoot);
  return captureTrustedPosixShell(projectRoot);
}

function sameShell(left: ShellIdentity, right: ShellIdentity): boolean {
  return (
    left.requestedPath === right.requestedPath &&
    left.argvPrefix.join("\0") === right.argvPrefix.join("\0") &&
    left.realPath === right.realPath &&
    left.linkDev === right.linkDev &&
    left.linkIno === right.linkIno &&
    left.linkSize === right.linkSize &&
    left.linkMtimeMs === right.linkMtimeMs &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs
  );
}

function packageScriptChildPath(binDir: string, shell: ShellIdentity): string {
  if (executionPlatform() === "win32") {
    const systemDir = path.dirname(shell.requestedPath);
    const windowsDir = path.dirname(systemDir);
    if (!systemDir || !windowsDir || systemDir === "." || windowsDir === ".") return "";
    return [binDir, systemDir, windowsDir].join(";");
  }
  return [binDir, ...trustedInspectPath().split(path.delimiter)].filter(Boolean).join(path.delimiter);
}

function buildPackageScriptEnv(shellReal: string, pathValue: string): NodeJS.ProcessEnv {
  const env = buildAgentExecutionEnv(path.dirname(shellReal));
  env.PATH = pathValue;
  if (executionPlatform() === "win32") {
    const windowsDir = path.dirname(path.dirname(shellReal));
    env.COMSPEC = shellReal;
    env.PATHEXT = ".COM;.EXE;.BAT;.CMD";
    env.SYSTEMROOT = windowsDir;
    env.SystemRoot = windowsDir;
    env.WINDIR = windowsDir;
  }
  return env;
}

function packageBindingFresh(binding: PackageScriptBinding, ownerId: number, canonicalRoot: string): AgentExecutionFailureCode | null {
  if (binding.ownerId !== ownerId) return "approval_invalid";
  if (binding.sessionEpoch !== sessionEpoch) return "project_changed";
  if (binding.canonicalRoot !== canonicalRoot) return "project_changed";
  if (binding.expiresAt <= nowMs()) return "approval_expired";
  if (binding.environmentPolicyKey !== projectCodeEnvironmentPolicyKey()) return "environment_not_allowed";
  if (binding.timeoutMs !== (testRuntime.timeoutMs ?? AGENT_COMMAND_TIMEOUT_MS)) return "approval_invalid";
  const key = packageScriptPlanKey({
    scriptName: binding.scriptName,
    scriptBodySha256: binding.scriptBodySha256,
    pathValue: binding.pathValue,
    shellPath: binding.shell.requestedPath,
    argvPrefix: binding.shell.argvPrefix,
  });
  if (key !== binding.planKey) return "approval_invalid";
  return null;
}

async function rejectProjectNpmrc(canonicalRoot: string): Promise<AgentExecutionFailureCode | null> {
  try {
    await fs.lstat(path.join(canonicalRoot, ".npmrc"));
    return "environment_not_allowed";
  } catch {
    return null;
  }
}

async function captureBinDirectory(
  canonicalRoot: string,
): Promise<{ readonly ok: true; readonly identity: DirectoryIdentity } | { readonly ok: false; readonly code: AgentExecutionFailureCode }> {
  const modulesPath = path.join(canonicalRoot, "node_modules");
  const binPath = path.join(modulesPath, ".bin");
  let modulesStat;
  try {
    modulesStat = await fs.lstat(modulesPath);
  } catch {
    return { ok: false, code: "executable_not_allowed" };
  }
  if (modulesStat.isSymbolicLink()) return { ok: false, code: "symlink_escape" };
  if (!modulesStat.isDirectory()) return { ok: false, code: "executable_not_allowed" };
  let binStat;
  try {
    binStat = await fs.lstat(binPath);
  } catch {
    return { ok: false, code: "executable_not_allowed" };
  }
  if (binStat.isSymbolicLink()) return { ok: false, code: "symlink_escape" };
  if (!binStat.isDirectory()) return { ok: false, code: "executable_not_allowed" };
  const real = realpathOrNull(binPath);
  if (!real || real !== binPath) return { ok: false, code: "symlink_escape" };
  const names = (await fs.readdir(binPath)).sort();
  const lines: string[] = [];
  for (const name of names) {
    if (name.includes("\0") || name.includes("/") || name.includes("\\")) return { ok: false, code: "executable_not_allowed" };
    const entry = path.join(binPath, name);
    const st = await fs.lstat(entry);
    if (st.isSymbolicLink()) {
      const target = await fs.readlink(entry);
      const resolved = path.resolve(binPath, target);
      let targetStat;
      try {
        targetStat = await fs.lstat(resolved);
      } catch {
        return { ok: false, code: "executable_not_allowed" };
      }
      if (targetStat.isSymbolicLink() || !targetStat.isFile()) return { ok: false, code: "executable_not_allowed" };
      lines.push(
        `${name}\tsymlink\t${st.dev}:${st.ino}:${st.size}:${st.mtimeMs}\t${target}\t${targetStat.dev}:${targetStat.ino}:${targetStat.size}:${targetStat.mtimeMs}`,
      );
      continue;
    }
    const kind = st.isFile() ? "file" : st.isDirectory() ? "dir" : "other";
    lines.push(`${name}\t${kind}\t${st.dev}:${st.ino}:${st.size}:${st.mtimeMs}`);
  }
  const again = await fs.lstat(binPath);
  if (again.isSymbolicLink() || !again.isDirectory() || again.ino !== binStat.ino || again.mtimeMs !== binStat.mtimeMs) {
    return { ok: false, code: "executable_identity_changed" };
  }
  return {
    ok: true,
    identity: {
      canonicalPath: binPath,
      dev: again.dev,
      ino: again.ino,
      size: again.size,
      mtimeMs: again.mtimeMs,
      sha256: createHash("sha256").update(lines.join("\n")).digest("hex"),
    },
  };
}

function sameDirectoryIdentity(left: DirectoryIdentity, right: DirectoryIdentity): boolean {
  return (
    left.canonicalPath === right.canonicalPath &&
    left.dev === right.dev &&
    left.ino === right.ino &&
    left.size === right.size &&
    left.mtimeMs === right.mtimeMs &&
    left.sha256 === right.sha256
  );
}

async function loadPackageScriptFacts(
  canonicalRoot: string,
  scriptName: PackageScriptBinding["scriptName"],
): Promise<
  | {
      readonly ok: true;
      readonly body: string;
      readonly packageIdentity: PackageFileIdentity;
      readonly lockIdentity: PackageFileIdentity;
      readonly binIdentity: DirectoryIdentity;
      readonly shell: ShellIdentity;
      readonly pathValue: string;
    }
  | { readonly ok: false; readonly code: AgentExecutionFailureCode }
> {
  const npmrc = await rejectProjectNpmrc(canonicalRoot);
  if (npmrc) return { ok: false, code: npmrc };
  const alternate = await rejectAlternateLockfiles(canonicalRoot);
  if (alternate) return { ok: false, code: alternate };
  const manifest = await capturePackageFile(canonicalRoot, "package.json", false);
  if (!manifest.ok) return manifest;
  const body = scriptBodyFromManifest(manifest.bytes, scriptName);
  if (!body.ok) return body;
  const lock = await capturePackageFile(canonicalRoot, "package-lock.json", true);
  if (!lock.ok) return lock;
  const bin = await captureBinDirectory(canonicalRoot);
  if (!bin.ok) return bin;
  const shell = captureTrustedShell(canonicalRoot);
  if (!shell) return { ok: false, code: "executable_not_allowed" };
  const pathValue = packageScriptChildPath(bin.identity.canonicalPath, shell);
  if (pathValue.length === 0 || pathValue.includes("\0")) return { ok: false, code: "environment_not_allowed" };
  return {
    ok: true,
    body: body.body,
    packageIdentity: manifest.identity,
    lockIdentity: lock.identity,
    binIdentity: bin.identity,
    shell,
    pathValue,
  };
}

export async function preparePackageScriptApproval(input: {
  readonly payload: unknown;
  readonly projectRoot: string | null;
  readonly ownerId: number;
  readonly senderAllowed: boolean;
}): Promise<
  | {
      readonly ok: true;
      readonly previewId: string;
      readonly scriptName: string;
      readonly scriptBody: string;
      readonly executable: string;
      readonly arguments: readonly string[];
      readonly path: string;
      readonly workingDirectory: string;
      readonly timeoutMs: number;
      readonly environmentPolicy: string;
      readonly shellWarning: string;
      readonly packageJsonSha256: string;
      readonly scriptBodySha256: string;
      readonly lockfileSha256: string;
      readonly binDirectorySha256: string;
    }
  | AgentExecResult
> {
  if (clearing) await clearing;
  if (!input.senderAllowed) return packageScriptFailure("sender_not_allowed", input.ownerId);
  const project = await resolveCanonicalProject(input.projectRoot);
  if (!project.ok) return packageScriptFailure(project.code, input.ownerId);
  const planned = planPackageScriptRequest(input.payload);
  if (!planned.ok) {
    recordDenial(planned.executionClass, planned.code, planned.message, input.ownerId);
    recordApproval("denied", planned.code, planned.message, input.ownerId);
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
  const facts = await loadPackageScriptFacts(project.canonicalRoot, planned.scriptName);
  if (!facts.ok) return packageScriptFailure(facts.code, input.ownerId);
  const scriptBodySha256 = createHash("sha256").update(facts.body).digest("hex");
  const previewId = randomBytes(16).toString("hex");
  const ttl = testRuntime.approvalTtlMs ?? PACKAGE_SCRIPT_APPROVAL_TTL_MS;
  const timeoutMs = testRuntime.timeoutMs ?? planned.timeoutMs;
  packageScriptPreviews.set(previewId, {
    id: previewId,
    ownerId: input.ownerId,
    sessionEpoch,
    canonicalRoot: project.canonicalRoot,
    scriptName: planned.scriptName,
    scriptBody: facts.body,
    scriptBodySha256,
    planKey: packageScriptPlanKey({
      scriptName: planned.scriptName,
      scriptBodySha256,
      pathValue: facts.pathValue,
      shellPath: facts.shell.requestedPath,
      argvPrefix: facts.shell.argvPrefix,
    }),
    pathValue: facts.pathValue,
    environmentPolicyKey: projectCodeEnvironmentPolicyKey(),
    timeoutMs,
    shell: facts.shell,
    packageIdentity: facts.packageIdentity,
    lockIdentity: facts.lockIdentity,
    binIdentity: facts.binIdentity,
    expiresAt: nowMs() + Math.max(0, ttl),
  });
  return {
    ok: true,
    previewId,
    scriptName: planned.scriptName,
    scriptBody: facts.body,
    executable: facts.shell.requestedPath,
    arguments: [],
    path: facts.pathValue,
    workingDirectory: project.canonicalRoot,
    timeoutMs,
    environmentPolicy: PACKAGE_SCRIPT_ENVIRONMENT_TEXT,
    shellWarning: packageScriptShellWarning(executionPlatform()),
    packageJsonSha256: facts.packageIdentity.sha256,
    scriptBodySha256,
    lockfileSha256: facts.lockIdentity.sha256,
    binDirectorySha256: facts.binIdentity.sha256,
  };
}

export async function approvePackageScriptPreview(input: {
  readonly previewId: unknown;
  readonly ownerId: number;
  readonly senderAllowed: boolean;
}): Promise<AgentExecResult> {
  void input.previewId;
  if (!input.senderAllowed) return packageScriptFailure("sender_not_allowed", input.ownerId);
  return packageScriptFailure("approval_invalid", input.ownerId);
}

async function revalidatePackageScript(
  binding: PackageScriptBinding,
  ownerId: number,
  projectRoot: string | null,
): Promise<{ readonly ok: true; readonly canonicalRoot: string } | { readonly ok: false; readonly code: AgentExecutionFailureCode }> {
  const project = await resolveCanonicalProject(projectRoot);
  if (!project.ok) return project;
  const stale = packageBindingFresh(binding, ownerId, project.canonicalRoot);
  if (stale) return { ok: false, code: stale };
  const facts = await loadPackageScriptFacts(project.canonicalRoot, binding.scriptName);
  if (!facts.ok) return facts;
  if (facts.body !== binding.scriptBody) return { ok: false, code: "package_manifest_changed" };
  if (createHash("sha256").update(facts.body).digest("hex") !== binding.scriptBodySha256) {
    return { ok: false, code: "package_manifest_changed" };
  }
  if (!samePackageIdentity(facts.packageIdentity, binding.packageIdentity)) {
    return { ok: false, code: "package_manifest_changed" };
  }
  if (!samePackageIdentity(facts.lockIdentity, binding.lockIdentity)) return { ok: false, code: "lockfile_changed" };
  if (!sameDirectoryIdentity(facts.binIdentity, binding.binIdentity)) return { ok: false, code: "executable_identity_changed" };
  if (!sameShell(facts.shell, binding.shell)) return { ok: false, code: "executable_identity_changed" };
  if (facts.pathValue !== binding.pathValue) return { ok: false, code: "environment_not_allowed" };
  return { ok: true, canonicalRoot: project.canonicalRoot };
}

export async function executeApprovedPackageScript(input: {
  readonly payload: unknown;
  readonly projectRoot: string | null;
  readonly ownerId: number;
  readonly senderAllowed: boolean;
}): Promise<AgentExecResult> {
  if (clearing) await clearing;
  const burnPresentedToken = () => {
    if (input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)) {
      const presented = (input.payload as { token?: unknown }).token;
      if (typeof presented === "string") packageScriptTokens.delete(presented);
    }
  };
  if (!input.senderAllowed) {
    burnPresentedToken();
    return packageScriptFailure("sender_not_allowed", input.ownerId);
  }
  if (inFlight >= AGENT_EXECUTION_MAX_CONCURRENCY) {
    burnPresentedToken();
    return packageScriptFailure("operation_in_progress", input.ownerId);
  }
  const parsed = parsePackageScriptExecutionToken(input.payload);
  if (!parsed.ok) {
    if (input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)) {
      const presented = (input.payload as { token?: unknown }).token;
      if (typeof presented === "string" && /^[a-f0-9]{32}$/.test(presented)) packageScriptTokens.delete(presented);
    }
    recordDenial(parsed.executionClass, parsed.code, parsed.message, input.ownerId);
    recordApproval("denied", parsed.code, parsed.message, input.ownerId);
    return {
      ok: false,
      exitCode: null,
      stdout: "",
      stderr: "",
      durationMs: 0,
      timedOut: false,
      truncated: false,
      error: parsed.message,
      code: parsed.code,
    };
  }
  const token = packageScriptTokens.get(parsed.token);
  packageScriptTokens.delete(parsed.token);
  if (!token) return packageScriptFailure("approval_invalid", input.ownerId);
  const checked = await revalidatePackageScript(token, input.ownerId, input.projectRoot);
  if (!checked.ok) return packageScriptFailure(checked.code, input.ownerId);
  if (testRuntime.beforeSpawn) await testRuntime.beforeSpawn();
  const again = await revalidatePackageScript(token, input.ownerId, input.projectRoot);
  if (!again.ok) return packageScriptFailure(again.code, input.ownerId);
  const shellNow = captureTrustedShell(again.canonicalRoot);
  if (!shellNow || !sameShell(shellNow, token.shell)) return packageScriptFailure("executable_identity_changed", input.ownerId);

  const epochAtStart = sessionEpoch;
  const rootAtStart = again.canonicalRoot;
  cancelRequested = false;
  inFlight += 1;
  activeOwnerId = input.ownerId;
  const start = Date.now();
  let stdout = "";
  let stderr = "";
  let truncated = false;
  let timedOut = false;
  const cap = testRuntime.maxOutputChars ?? AGENT_COMMAND_OUTPUT_CHARS;
  try {
    const result = await new Promise<AgentExecResult>((resolve) => {
      const child = spawn(shellNow.realPath, [...shellNow.argvPrefix, token.scriptBody], {
        cwd: rootAtStart,
        env: buildPackageScriptEnv(shellNow.realPath, token.pathValue),
        windowsHide: true,
        shell: false,
        detached: false,
        stdio: ["ignore", "pipe", "pipe"],
      });
      if (typeof child.pid === "number") activePid = child.pid;
      const timer = setTimeout(() => {
        timedOut = true;
        if (typeof child.pid === "number") void terminateTrackedPids([child.pid], { termGraceMs: 200 });
        else child.kill("SIGTERM");
      }, token.timeoutMs);
      const append = (dest: "out" | "err", chunk: Buffer) => {
        const text = chunk.toString("utf8");
        const next = (dest === "out" ? stdout : stderr) + text;
        const clipped = next.length > cap;
        if (clipped) truncated = true;
        if (dest === "out") stdout = clipped ? next.slice(0, cap) : next;
        else stderr = clipped ? next.slice(0, cap) : next;
        if (truncated && typeof child.pid === "number") void terminateTrackedPids([child.pid], { termGraceMs: 200 });
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
        else if (cancelRequested) resultCode = "cancelled";
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
      recordDenial("user_approved_package_script", result.code, result.error ?? agentExecutionFailureMessage(result.code), input.ownerId);
      recordApproval("denied", result.code, result.error ?? agentExecutionFailureMessage(result.code), input.ownerId);
    } else {
      recordApproval("approved", "completed", "Approved package script finished.", input.ownerId);
    }
    return result;
  } finally {
    inFlight = Math.max(0, inFlight - 1);
    activePid = null;
    activeOwnerId = null;
  }
}

export async function cancelPackageScriptApproval(input: {
  readonly previewId?: unknown;
  readonly token?: unknown;
  readonly ownerId: number;
  readonly senderAllowed: boolean;
}): Promise<{ readonly ok: true } | AgentExecResult> {
  if (!input.senderAllowed) return packageScriptFailure("sender_not_allowed", input.ownerId);
  if (typeof input.previewId === "string") {
    const preview = packageScriptPreviews.get(input.previewId);
    if (preview && preview.ownerId === input.ownerId) packageScriptPreviews.delete(input.previewId);
  }
  if (typeof input.token === "string") {
    const token = packageScriptTokens.get(input.token);
    if (token && token.ownerId === input.ownerId) packageScriptTokens.delete(input.token);
  }
  if (activeOwnerId === input.ownerId) {
    cancelRequested = true;
    const pid = activePid;
    if (typeof pid === "number") await terminateTrackedPids([pid], { termGraceMs: 200 });
  }
  recordApproval("denied", "cancelled", "User cancelled package-script approval.", input.ownerId);
  return { ok: true };
}

async function askPackageScriptConfirmation(
  binding: PackageScriptBinding,
  parentWindow: BrowserWindow | null,
): Promise<"approve" | "cancel"> {
  if (testRuntime.trustedDecision) return testRuntime.trustedDecision();
  const nonce = randomBytes(16).toString("hex");
  const win = new BrowserWindow({
    parent: parentWindow ?? undefined,
    modal: Boolean(parentWindow),
    width: 720,
    height: 640,
    show: true,
    title: "Approve package script",
    webPreferences: {
      preload: path.join(__dirname, "packageScriptConfirmPreload.cjs"),
      additionalArguments: [`--project-code-nonce=${nonce}`],
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  activePackageScriptConfirm = win;
  win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  win.webContents.on("will-navigate", (event) => event.preventDefault());
  win.webContents.on("will-redirect", (event) => event.preventDefault());
  const senderId = win.webContents.id;
  const decision = await new Promise<"approve" | "cancel">((resolve) => {
    openChallenges.set(senderId, { nonce, resolve });
    win.on("closed", () => {
      if (activePackageScriptConfirm === win) activePackageScriptConfirm = null;
      if (openChallenges.delete(senderId)) resolve("cancel");
    });
    win.webContents.once("did-finish-load", () => {
      if (win.isDestroyed()) return;
      win.webContents.send("package-script-confirm-details", {
        scriptName: binding.scriptName,
        scriptBody: binding.scriptBody,
        executable: binding.shell.requestedPath,
        arguments: "none",
        path: binding.pathValue,
        workingDirectory: binding.canonicalRoot,
        timeout: `${binding.timeoutMs}ms`,
        environmentPolicy: PACKAGE_SCRIPT_ENVIRONMENT_TEXT,
        shellWarning: packageScriptShellWarning(executionPlatform()),
        packageJsonSha256: binding.packageIdentity.sha256,
        scriptBodySha256: binding.scriptBodySha256,
        lockfileSha256: binding.lockIdentity.present ? binding.lockIdentity.sha256 : "(no package-lock.json)",
        binDirectorySha256: binding.binIdentity.sha256,
      });
    });
    void win.loadFile(path.join(__dirname, "packageScriptConfirm.html"));
  });
  if (!win.isDestroyed()) win.close();
  return decision;
}

export async function runTrustedPackageScriptConfirmation(input: {
  readonly previewId: unknown;
  readonly projectRoot: string | null;
  readonly ownerId: number;
  readonly senderAllowed: boolean;
  readonly parentWindow?: BrowserWindow | null;
}): Promise<AgentExecResult | { readonly ok: true; readonly held: true }> {
  if (clearing) await clearing;
  if (!input.senderAllowed) return packageScriptFailure("sender_not_allowed", input.ownerId);
  if (typeof input.previewId !== "string" || !/^[a-f0-9]{32}$/.test(input.previewId)) {
    return packageScriptFailure("approval_invalid", input.ownerId);
  }
  const preview = packageScriptPreviews.get(input.previewId);
  if (!preview || !packageScriptPreviews.delete(input.previewId)) {
    return packageScriptFailure("approval_invalid", input.ownerId);
  }
  const decision = await askPackageScriptConfirmation(preview, input.parentWindow ?? null);
  if (decision !== "approve") return packageScriptFailure("cancelled", input.ownerId);
  const checked = await revalidatePackageScript(preview, input.ownerId, input.projectRoot);
  if (!checked.ok) return packageScriptFailure(checked.code, input.ownerId);
  const token = randomBytes(16).toString("hex");
  const ttl = testRuntime.approvalTtlMs ?? PACKAGE_SCRIPT_APPROVAL_TTL_MS;
  packageScriptTokens.set(token, {
    ...preview,
    id: token,
    expiresAt: nowMs() + Math.max(0, ttl),
    sessionEpoch,
    canonicalRoot: checked.canonicalRoot,
  });
  recordApproval("approved", "approved", "User approved package-script execution.", input.ownerId);
  if (testRuntime.holdToken) {
    testRuntime.holdToken(token);
    return { ok: true, held: true };
  }
  return executeApprovedPackageScript({
    payload: { token },
    projectRoot: input.projectRoot,
    ownerId: input.ownerId,
    senderAllowed: true,
  });
}

export async function rejectRendererPackageScriptRedemption(input: {
  readonly payload: unknown;
  readonly ownerId: number;
  readonly senderAllowed: boolean;
}): Promise<AgentExecResult> {
  if (input.payload && typeof input.payload === "object" && !Array.isArray(input.payload)) {
    const presented = (input.payload as { token?: unknown }).token;
    if (typeof presented === "string") packageScriptTokens.delete(presented);
  }
  if (!input.senderAllowed) return packageScriptFailure("sender_not_allowed", input.ownerId);
  return packageScriptFailure("approval_invalid", input.ownerId);
}

export function registerTerminalExecIpc(
  ipcMain: IpcMain,
  _isWithinProject: (target: string) => boolean,
  getProjectRoot: () => string | null,
  getMainWindow: () => BrowserWindow | null = () => BrowserWindow.getFocusedWindow(),
): void {
  void recoverProjectCodeSnapshots();
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

  ipcMain.handle("agent:executionApprovals", async (event) => {
    if (!isAgentExecutionSenderAllowed(event, getMainWindow)) return [];
    return listAgentExecutionApprovals(event.sender.id);
  });

  ipcMain.handle("agent:projectCodePrepare", async (event, payload: unknown) => {
    const allowed = isAgentExecutionSenderAllowed(event, getMainWindow);
    return prepareProjectCodeApproval({
      payload,
      projectRoot: getProjectRoot(),
      ownerId: event.sender.id,
      senderAllowed: allowed,
    });
  });

  ipcMain.handle("agent:projectCodeApprove", async (event, previewId: unknown) => {
    const allowed = isAgentExecutionSenderAllowed(event, getMainWindow);
    return approveProjectCodePreview({
      previewId,
      projectRoot: getProjectRoot(),
      ownerId: event.sender.id,
      senderAllowed: allowed,
    });
  });

  ipcMain.handle("agent:projectCodeExecute", async (event, payload: unknown) => {
    const allowed = isAgentExecutionSenderAllowed(event, getMainWindow);
    return rejectRendererProjectCodeRedemption({
      payload,
      ownerId: event.sender.id,
      senderAllowed: allowed,
    });
  });

  ipcMain.handle("agent:projectCodeConfirm", async (event, previewId: unknown) => {
    const allowed = isAgentExecutionSenderAllowed(event, getMainWindow);
    return runTrustedProjectCodeConfirmation({
      previewId,
      projectRoot: getProjectRoot(),
      ownerId: event.sender.id,
      senderAllowed: allowed,
      parentWindow: getMainWindow(),
    });
  });

  ipcMain.on("agent:projectCodeChallenge", (event, payload: unknown) => {
    acceptProjectCodeChallenge(event.sender.id, payload);
  });

  ipcMain.handle("agent:projectCodeCancel", async (event, payload: unknown) => {
    const allowed = isAgentExecutionSenderAllowed(event, getMainWindow);
    const record = payload && typeof payload === "object" ? (payload as { previewId?: unknown; token?: unknown }) : {};
    return cancelProjectCodeApproval({
      previewId: record.previewId,
      token: record.token,
      ownerId: event.sender.id,
      senderAllowed: allowed,
    });
  });

  ipcMain.handle("agent:packageScriptPrepare", async (event, payload: unknown) => {
    const allowed = isAgentExecutionSenderAllowed(event, getMainWindow);
    return preparePackageScriptApproval({
      payload,
      projectRoot: getProjectRoot(),
      ownerId: event.sender.id,
      senderAllowed: allowed,
    });
  });

  ipcMain.handle("agent:packageScriptApprove", async (event, previewId: unknown) => {
    const allowed = isAgentExecutionSenderAllowed(event, getMainWindow);
    return approvePackageScriptPreview({
      previewId,
      ownerId: event.sender.id,
      senderAllowed: allowed,
    });
  });

  ipcMain.handle("agent:packageScriptExecute", async (event, payload: unknown) => {
    const allowed = isAgentExecutionSenderAllowed(event, getMainWindow);
    return rejectRendererPackageScriptRedemption({
      payload,
      ownerId: event.sender.id,
      senderAllowed: allowed,
    });
  });

  ipcMain.handle("agent:packageScriptConfirm", async (event, previewId: unknown) => {
    const allowed = isAgentExecutionSenderAllowed(event, getMainWindow);
    return runTrustedPackageScriptConfirmation({
      previewId,
      projectRoot: getProjectRoot(),
      ownerId: event.sender.id,
      senderAllowed: allowed,
      parentWindow: getMainWindow(),
    });
  });

  ipcMain.handle("agent:packageScriptCancel", async (event, payload: unknown) => {
    const allowed = isAgentExecutionSenderAllowed(event, getMainWindow);
    const record = payload && typeof payload === "object" ? (payload as { previewId?: unknown; token?: unknown }) : {};
    return cancelPackageScriptApproval({
      previewId: record.previewId,
      token: record.token,
      ownerId: event.sender.id,
      senderAllowed: allowed,
    });
  });
}
