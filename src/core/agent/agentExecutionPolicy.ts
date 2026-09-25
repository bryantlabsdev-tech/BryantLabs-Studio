/**
 * Application-enforced Agent execution policy (not a kernel, container, or OS sandbox).
 *
 * Electron main cannot import this file (electron/tsconfig rootDir is electron/).
 * Keep electron/agentExecutionPolicy.cts in lockstep. CI fails if the copies diverge
 * after import-path normalization. Shared vectors plus collectAgentExecutionPolicyParity
 * cover recipes, argv, failure codes, env rules, and snapshot text.
 *
 * Autonomous agents may only run inspect recipes. Project-controlled package scripts,
 * npx, local binaries, and other project code are not agent-authorized this phase
 * (no auto-confirm approval path). User-confirmed Git push/branch/worktree remain
 * product-owned privileged operations outside this policy.
 */

import { redactSensitiveText } from "../git/gitPushPolicy";

export { redactSensitiveText };

export const AGENT_EXECUTION_POLICY_LABEL = "Agent execution policy";
export const AGENT_EXECUTION_ISOLATION_LEVEL = "application" as const;
export const AGENT_COMMAND_TIMEOUT_MS = 120_000;
export const AGENT_COMMAND_OUTPUT_CHARS = 80_000;
export const AGENT_COMMAND_MAX_CHARS = 240;
export const AGENT_EXECUTION_MAX_CONCURRENCY = 1;
export const AGENT_DENIAL_LOG_LIMIT = 24;
export const FORBIDDEN_GREENFIELD_MAIN = "/private/tmp/bryantlabs-greenfield-main";
export const GIT_INSPECT_LOG_DEFAULT = 20;
export const GIT_INSPECT_LOG_MAX = 99;

export type AgentExecutionClass =
  | "agent_readonly_inspect"
  | "user_approved_project_code"
  | "product_owned_fixed"
  | "product_git_privileged"
  | "product_provider_network"
  | "user_interactive_pty";

export type AgentNetworkClassification = "denied" | "product_provider_http" | "not_isolated";

export type AgentInspectRecipeId =
  | "git_status"
  | "git_diff"
  | "git_log"
  | "node_version"
  | "npm_version";

export type AgentExecutableIdentity = "git" | "node" | "npm";

export type AgentExecutionFailureCode =
  | "no_project"
  | "outside_root"
  | "symlink_escape"
  | "invalid_request"
  | "execution_not_allowed"
  | "executable_not_allowed"
  | "arguments_not_allowed"
  | "network_not_allowed"
  | "git_mutation_not_allowed"
  | "environment_not_allowed"
  | "operation_in_progress"
  | "project_changed"
  | "cancelled"
  | "timeout"
  | "output_limit"
  | "generic_failure"
  | "approval_required"
  | "approval_invalid"
  | "approval_expired"
  | "recipe_not_allowed"
  | "executable_identity_changed"
  | "sender_not_allowed"
  | "project_code_not_isolated";

export const AGENT_EXECUTION_FAILURE_CODES: readonly AgentExecutionFailureCode[] = [
  "no_project",
  "outside_root",
  "symlink_escape",
  "invalid_request",
  "execution_not_allowed",
  "executable_not_allowed",
  "arguments_not_allowed",
  "network_not_allowed",
  "git_mutation_not_allowed",
  "environment_not_allowed",
  "operation_in_progress",
  "project_changed",
  "cancelled",
  "timeout",
  "output_limit",
  "generic_failure",
  "approval_required",
  "approval_invalid",
  "approval_expired",
  "recipe_not_allowed",
  "executable_identity_changed",
  "sender_not_allowed",
  "project_code_not_isolated",
];

export const AGENT_INSPECT_RECIPE_IDS: readonly AgentInspectRecipeId[] = [
  "git_status",
  "git_diff",
  "git_log",
  "node_version",
  "npm_version",
];

export interface AgentInspectOperands {
  readonly path?: string;
  readonly maxCount?: number;
}

export interface AgentInspectRequest {
  readonly recipe: AgentInspectRecipeId;
  readonly operands?: AgentInspectOperands;
}

export interface AgentInspectPlan {
  readonly ok: true;
  readonly executionClass: "agent_readonly_inspect";
  readonly recipe: AgentInspectRecipeId;
  readonly executable: AgentExecutableIdentity;
  readonly argv: readonly string[];
  readonly operands: AgentInspectOperands;
  readonly network: "denied";
  readonly timeoutMs: number;
  readonly maxOutputChars: number;
  readonly reason: string;
}

export interface AgentInspectDenied {
  readonly ok: false;
  readonly executionClass: "agent_readonly_inspect";
  readonly code: AgentExecutionFailureCode;
  readonly message: string;
}

export type AgentInspectDecision = AgentInspectPlan | AgentInspectDenied;

export interface AgentExecutionPolicySnapshot {
  readonly label: string;
  readonly isolationLevel: typeof AGENT_EXECUTION_ISOLATION_LEVEL;
  readonly osSandboxClaimed: false;
  readonly kernelFirewall: false;
  readonly autonomousInspection: string;
  readonly approvedProjectCode: string;
  readonly filesystemScope: string;
  readonly shellEnabled: false;
  readonly gitMutationAvailableToAgents: false;
  readonly network: string;
  readonly environment: string;
  readonly processLimits: string;
  readonly timeoutMs: number;
  readonly maxOutputChars: number;
  readonly maxConcurrency: number;
  readonly cancellation: string;
  readonly allowedRecipes: readonly string[];
  readonly privilegedOutsideAgent: readonly string[];
}

export interface AgentExecutionDenialRecord {
  readonly at: number;
  readonly code: AgentExecutionFailureCode;
  readonly executionClass: AgentExecutionClass;
  readonly reason: string;
  readonly ownerId: number;
}

const GIT_MUTATION_SUBCOMMANDS = new Set([
  "add",
  "am",
  "apply",
  "branch",
  "checkout",
  "cherry-pick",
  "clean",
  "clone",
  "commit",
  "config",
  "fetch",
  "filter-branch",
  "gc",
  "init",
  "merge",
  "mv",
  "notes",
  "pull",
  "push",
  "rebase",
  "remote",
  "replace",
  "reset",
  "restore",
  "revert",
  "rm",
  "stash",
  "submodule",
  "switch",
  "tag",
  "update-ref",
  "worktree",
]);

const NETWORK_EXECUTABLES = new Set([
  "curl",
  "wget",
  "ssh",
  "scp",
  "sftp",
  "nc",
  "ncat",
  "netcat",
  "telnet",
  "nmap",
  "rsync",
  "ftp",
  "aria2c",
]);

const PROJECT_CODE_HEADS = new Set([
  "npm",
  "npx",
  "pnpm",
  "yarn",
  "bun",
  "vite",
  "tsc",
  "vitest",
  "eslint",
  "prettier",
  "webpack",
  "rollup",
  "esbuild",
]);

const SHELL_METACHAR = /[;&|`$()<>\\'"{}]|&&|\|\||\$\(/;
const CONTROL_OR_NUL = /[\u0000-\u001f\u007f]/;

export const AGENT_EXEC_ENV_KEEP = [
  "LANG",
  "LC_ALL",
  "LC_CTYPE",
  "LC_MESSAGES",
  "TMPDIR",
  "TMP",
  "TEMP",
  "SYSTEMROOT",
  "WINDIR",
  "COMSPEC",
  "PATHEXT",
] as const;

export const AGENT_EXEC_ENV_DROP_PREFIXES = [
  "GIT_TRACE",
  "GIT_CONFIG_",
  "NPM_CONFIG_",
  "NODE_OPTIONS",
  "NODE_EXTRA",
  "LD_",
  "DYLD_",
  "PYTHON",
  "PERL5",
  "RUBYOPT",
  "BASH_ENV",
  "AWS_",
  "GOOGLE_",
  "AZURE_",
] as const;

/** Fixed -c assignments so Git inspect cannot run aliases, hooks, pagers, or external diffs. */
export const GIT_INSPECT_CONFIG_ASSIGNMENTS: readonly string[] = [
  "core.hooksPath=/dev/null",
  "alias.status=",
  "alias.diff=",
  "alias.log=",
  "core.pager=cat",
  "core.editor=true",
  "core.sshCommand=",
  "core.gitProxy=",
  "core.askPass=",
  "core.fsmonitor=",
  "core.useBuiltinFSMonitor=false",
  "core.useReplaceRefs=false",
  "credential.helper=",
  "diff.external=",
  "diff.tool=",
  "diff.mnemonicPrefix=false",
  "diff.renames=false",
  "pager.status=false",
  "pager.diff=false",
  "pager.log=false",
  "interactive.diffFilter=",
  "filter.lfs.smudge=",
  "filter.lfs.clean=",
  "filter.lfs.process=",
  "gpg.program=",
  "log.showSignature=false",
  "protocol.ext.allow=never",
  "protocol.file.allow=never",
  "http.proxy=",
  "i18n.logOutputEncoding=UTF-8",
];

export function gitInspectSafeConfigPrefix(): string[] {
  const args: string[] = ["--no-optional-locks"];
  for (const assignment of GIT_INSPECT_CONFIG_ASSIGNMENTS) {
    args.push("-c", assignment);
  }
  return args;
}

export function agentExecutionFailureMessage(code: AgentExecutionFailureCode): string {
  switch (code) {
    case "no_project":
      return "Open a project before running agent inspection.";
    case "outside_root":
      return "That path is outside the open project.";
    case "symlink_escape":
      return "That path is not a regular project location Studio can use.";
    case "invalid_request":
      return "The agent execution request was malformed.";
    case "execution_not_allowed":
      return "That execution class is not available to agents.";
    case "executable_not_allowed":
      return "That program is not an autonomous inspect executable.";
    case "arguments_not_allowed":
      return "Those inspect operands are not allowed.";
    case "network_not_allowed":
      return "Network-capable recipes are not exposed to autonomous agents.";
    case "git_mutation_not_allowed":
      return "Agents cannot mutate Git. Use the Git view for privileged operations.";
    case "environment_not_allowed":
      return "Agents cannot supply environment, cwd, argv, or process limits.";
    case "operation_in_progress":
      return "An agent inspect command is already running.";
    case "project_changed":
      return "The open project changed. The command was cancelled.";
    case "cancelled":
      return "The agent command was cancelled.";
    case "timeout":
      return "The agent command timed out.";
    case "output_limit":
      return "The agent command produced too much output.";
    case "approval_required":
      return "That action needs explicit user approval and is not available to agents.";
    case "approval_invalid":
      return "That approval token is not valid.";
    case "approval_expired":
      return "That approval token expired.";
    case "recipe_not_allowed":
      return "That inspect recipe is not available to agents.";
    case "executable_identity_changed":
      return "The inspect executable changed before it could run.";
    case "sender_not_allowed":
      return "That window cannot run agent inspection.";
    case "project_code_not_isolated":
      return "Project scripts and local binaries are not isolated and are not available to agents.";
    default:
      return "The agent command failed.";
  }
}

export function buildAgentExecutionPolicySnapshot(): AgentExecutionPolicySnapshot {
  return {
    label: AGENT_EXECUTION_POLICY_LABEL,
    isolationLevel: AGENT_EXECUTION_ISOLATION_LEVEL,
    osSandboxClaimed: false,
    kernelFirewall: false,
    autonomousInspection:
      "Autonomous inspection: no network-capable recipe is exposed by the application policy.",
    approvedProjectCode:
      "Approved project-code execution: not network-isolated. Not available to agents in this phase.",
    filesystemScope:
      "Autonomous inspection accepts no arbitrary project code. Canonical cwd and operand validation protect Studio-owned inspect operands only; they do not confine executed project code. Safe filesystem transactions apply only to Studio-owned file operations. This is not filesystem isolation.",
    shellEnabled: false,
    gitMutationAvailableToAgents: false,
    network:
      "No kernel firewall or OS sandbox. Application allowlisting is not enforcement against network activity once arbitrary project code starts.",
    environment:
      "Inspect children receive a sanitized allowlisted environment. Tokens, proxy variables, SSH agent sockets, Git credential helpers, and dynamic-loader injection are not inherited.",
    processLimits:
      "Timeout, output caps, concurrency, cancellation, and process-tree termination are lifecycle controls, not containment. Tree kill is best-effort (SIGTERM then SIGKILL of discovered descendants; processes that ignore signals or escape discovery may survive).",
    timeoutMs: AGENT_COMMAND_TIMEOUT_MS,
    maxOutputChars: AGENT_COMMAND_OUTPUT_CHARS,
    maxConcurrency: AGENT_EXECUTION_MAX_CONCURRENCY,
    cancellation:
      "The discovered process tree is terminated on timeout, cancellation, window close, and project switch. Project switch waits for that termination before the active root changes.",
    allowedRecipes: [...AGENT_INSPECT_RECIPE_IDS],
    privilegedOutsideAgent: [
      "Git push / branch / worktree (user-confirmed, Electron main)",
      "Interactive PTY terminal (user UI, not an agent tool)",
      "Greenfield preview/install and product verification (product-owned)",
      "Provider API requests (product infrastructure)",
      "Project package scripts, npx, and local binaries (not agent-authorized this phase)",
    ],
  };
}

export function isForbiddenAgentLocation(canonicalPath: string): boolean {
  if (typeof canonicalPath !== "string" || canonicalPath.length === 0) return true;
  if (canonicalPath === FORBIDDEN_GREENFIELD_MAIN) return true;
  if (canonicalPath.startsWith(`${FORBIDDEN_GREENFIELD_MAIN}/`)) return true;
  return false;
}

export function isSafeAgentRelativePath(value: string): boolean {
  if (typeof value !== "string" || value.length === 0 || value.length > 1024) return false;
  const norm = value.replace(/\\/g, "/");
  if (norm.startsWith("/") || /^[a-zA-Z]:/.test(norm)) return false;
  if (norm.includes("\0") || CONTROL_OR_NUL.test(norm)) return false;
  if (norm.split("/").some((part) => part === ".." || part === "")) return false;
  if (norm === ".git" || norm.startsWith(".git/")) return false;
  return true;
}

function deny(code: AgentExecutionFailureCode): AgentInspectDenied {
  return {
    ok: false,
    executionClass: "agent_readonly_inspect",
    code,
    message: agentExecutionFailureMessage(code),
  };
}

function planOk(
  recipe: AgentInspectRecipeId,
  executable: AgentExecutableIdentity,
  argv: readonly string[],
  reason: string,
  operands: AgentInspectOperands = {},
): AgentInspectPlan {
  return {
    ok: true,
    executionClass: "agent_readonly_inspect",
    recipe,
    executable,
    argv,
    operands,
    network: "denied",
    timeoutMs: AGENT_COMMAND_TIMEOUT_MS,
    maxOutputChars: AGENT_COMMAND_OUTPUT_CHARS,
    reason,
  };
}

export function buildGitStatusArgv(relPath?: string): string[] {
  const argv = [
    ...gitInspectSafeConfigPrefix(),
    "status",
    "--porcelain=v1",
    "--untracked-files=normal",
    "--ignore-submodules=all",
  ];
  if (relPath) argv.push("--end-of-options", "--", relPath);
  return argv;
}

export function buildGitDiffArgv(relPath?: string): string[] {
  const argv = [
    ...gitInspectSafeConfigPrefix(),
    "diff",
    "--no-ext-diff",
    "--no-textconv",
    "--name-only",
  ];
  if (relPath) argv.push("--end-of-options", "--", relPath);
  return argv;
}

export function buildGitLogArgv(maxCount: number): string[] {
  return [
    ...gitInspectSafeConfigPrefix(),
    "log",
    "--no-ext-diff",
    "--oneline",
    "--decorate",
    "--max-count",
    String(maxCount),
  ];
}

function sanitizeOperands(operands: AgentInspectOperands | undefined): AgentInspectOperands | AgentInspectDenied {
  if (operands === undefined) return {};
  if (!operands || typeof operands !== "object" || Array.isArray(operands)) {
    return deny("invalid_request");
  }
  for (const key of Object.keys(operands)) {
    if (key !== "path" && key !== "maxCount") return deny("invalid_request");
  }
  if (operands.path !== undefined && !isSafeAgentRelativePath(operands.path)) {
    return deny("arguments_not_allowed");
  }
  if (operands.maxCount !== undefined) {
    if (!Number.isInteger(operands.maxCount) || operands.maxCount < 1 || operands.maxCount > GIT_INSPECT_LOG_MAX) {
      return deny("arguments_not_allowed");
    }
  }
  return operands;
}

export function parseAgentInspectRequest(payload: unknown): AgentInspectDecision {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return deny("invalid_request");
  }
  const record = payload as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "recipe" && key !== "operands") return deny("invalid_request");
  }
  const recipe = record.recipe;
  if (typeof recipe !== "string") return deny("invalid_request");
  if (!AGENT_INSPECT_RECIPE_IDS.includes(recipe as AgentInspectRecipeId)) {
    return deny("recipe_not_allowed");
  }
  const operands = sanitizeOperands(record.operands as AgentInspectOperands | undefined);
  if ("ok" in operands && operands.ok === false) return operands;
  return planInspectRecipe(recipe as AgentInspectRecipeId, operands as AgentInspectOperands);
}

export function planInspectRecipe(
  recipe: AgentInspectRecipeId,
  operands: AgentInspectOperands = {},
): AgentInspectDecision {
  if (operands.path !== undefined && recipe !== "git_status" && recipe !== "git_diff") {
    return deny("arguments_not_allowed");
  }
  if (operands.maxCount !== undefined && recipe !== "git_log") {
    return deny("arguments_not_allowed");
  }
  if (recipe === "git_status") {
    return planOk("git_status", "git", buildGitStatusArgv(operands.path), "Read-only git status.", operands);
  }
  if (recipe === "git_diff") {
    return planOk("git_diff", "git", buildGitDiffArgv(operands.path), "Read-only git diff names.", operands);
  }
  if (recipe === "git_log") {
    const count = operands.maxCount ?? GIT_INSPECT_LOG_DEFAULT;
    return planOk("git_log", "git", buildGitLogArgv(count), "Read-only git log.", operands);
  }
  if (recipe === "node_version") {
    return planOk("node_version", "node", ["--version"], "Read Node.js version.");
  }
  if (recipe === "npm_version") {
    return planOk("npm_version", "npm", ["--version"], "Read npm version.");
  }
  return deny("recipe_not_allowed");
}

function tokenize(command: string): string[] | null {
  if (typeof command !== "string") return null;
  const trimmed = command.trim();
  if (!trimmed) return null;
  if (trimmed.length > AGENT_COMMAND_MAX_CHARS) return null;
  if (CONTROL_OR_NUL.test(trimmed)) return null;
  if (SHELL_METACHAR.test(trimmed)) return null;
  if (/\s\\\s/.test(trimmed)) return null;
  const tokens = trimmed.split(/[ \t]+/u);
  if (tokens.length === 0 || tokens.length > 12) return null;
  for (const token of tokens) {
    if (!token) return null;
    if (token.startsWith("@")) return null;
    if (token.includes("://")) return null;
    if (token.includes("..")) return null;
    if (token.startsWith("/") || /^[a-zA-Z]:/.test(token)) return null;
  }
  return tokens;
}

function looksLikeOptionInjection(token: string): boolean {
  const lower = token.toLowerCase();
  if (lower === "-c" || lower.startsWith("-c") || lower.startsWith("--config")) return true;
  if (lower.startsWith("--exec") || lower.startsWith("--upload-pack")) return true;
  if (lower.startsWith("--receive-pack") || lower.includes("=`")) return true;
  if (lower === "--" || lower.startsWith("--git-dir") || lower.startsWith("--work-tree")) return true;
  if (lower.startsWith("-e") || lower.startsWith("--require") || lower.startsWith("--experimental")) return true;
  if (lower.startsWith("--inspect") || lower.startsWith("--loader") || lower.startsWith("--import")) return true;
  return false;
}

/**
 * Pure routing from leftover command strings onto typed recipes.
 * Never send the original string over IPC.
 */
export function routeAgentCommandToInspect(command: unknown): AgentInspectDecision {
  if (typeof command !== "string") return deny("invalid_request");
  const tokens = tokenize(command);
  if (!tokens) return deny("invalid_request");
  const head = tokens[0]?.toLowerCase() ?? "";
  if (NETWORK_EXECUTABLES.has(head)) return deny("network_not_allowed");
  if (
    head === "sh" ||
    head === "bash" ||
    head === "zsh" ||
    head === "cmd" ||
    head === "powershell" ||
    head === "pwsh" ||
    head === "python" ||
    head === "python3" ||
    head === "perl" ||
    head === "ruby" ||
    head === "osascript"
  ) {
    return deny("executable_not_allowed");
  }
  if (PROJECT_CODE_HEADS.has(head) && head !== "npm") return deny("project_code_not_isolated");
  if (head === "npm") {
    if (tokens.length === 2 && tokens[1] === "--version") {
      return planInspectRecipe("npm_version");
    }
    return deny("project_code_not_isolated");
  }
  if (head === "node") {
    if (tokens.length === 2 && tokens[1] === "--version") {
      return planInspectRecipe("node_version");
    }
    return deny("project_code_not_isolated");
  }
  if (head === "git") {
    return routeGitInspect(tokens);
  }
  return deny("executable_not_allowed");
}

function routeGitInspect(tokens: readonly string[]): AgentInspectDecision {
  const sub = tokens[1]?.toLowerCase() ?? "";
  if (!sub) return deny("arguments_not_allowed");
  if (sub.startsWith("-")) return deny("arguments_not_allowed");
  if (GIT_MUTATION_SUBCOMMANDS.has(sub)) return deny("git_mutation_not_allowed");
  if (tokens.some((token) => looksLikeOptionInjection(token))) return deny("arguments_not_allowed");
  const rest = tokens.slice(2);
  if (sub === "status") {
    const flags = new Set(["--porcelain", "--porcelain=v1", "-sb", "--short", "-u"]);
    let path: string | undefined;
    for (const token of rest) {
      if (flags.has(token)) continue;
      if (isSafeAgentRelativePath(token) && path === undefined) {
        path = token;
        continue;
      }
      return deny("arguments_not_allowed");
    }
    return planInspectRecipe("git_status", path ? { path } : {});
  }
  if (sub === "diff") {
    const flags = new Set(["--stat", "--name-only", "--name-status", "--no-ext-diff", "--no-textconv"]);
    let path: string | undefined;
    for (const token of rest) {
      if (flags.has(token)) continue;
      if (isSafeAgentRelativePath(token) && path === undefined) {
        path = token;
        continue;
      }
      return deny("arguments_not_allowed");
    }
    return planInspectRecipe("git_diff", path ? { path } : {});
  }
  if (sub === "log") {
    let maxCount: number | undefined;
    for (let i = 0; i < rest.length; i += 1) {
      const token = rest[i] ?? "";
      if (token === "-n" || token === "--max-count") {
        const next = rest[i + 1] ?? "";
        if (!/^[0-9]{1,2}$/.test(next)) return deny("arguments_not_allowed");
        maxCount = Number(next);
        i += 1;
        continue;
      }
      if (token === "--oneline" || token === "--decorate" || token === "--no-ext-diff") continue;
      return deny("arguments_not_allowed");
    }
    return planInspectRecipe("git_log", maxCount ? { maxCount } : {});
  }
  return deny("git_mutation_not_allowed");
}

export function planAgentCommand(command: unknown): AgentInspectDecision {
  return routeAgentCommandToInspect(command);
}

export function validateAgentCommand(
  command: string,
):
  | {
      readonly ok: true;
      readonly recipe: AgentInspectRecipeId;
      readonly operands: AgentInspectOperands;
    }
  | { readonly ok: false; readonly error: string } {
  const planned = routeAgentCommandToInspect(command);
  if (planned.ok) return { ok: true, recipe: planned.recipe, operands: planned.operands };
  return { ok: false, error: planned.message };
}

export function agentEnvKeyForbidden(key: string): boolean {
  const upper = key.toUpperCase();
  if (upper.includes("TOKEN") || upper.includes("SECRET") || upper.includes("PASSWORD") || upper.includes("API_KEY")) {
    return true;
  }
  if (upper.includes("PROXY") || upper === "SSH_AUTH_SOCK" || upper === "SSH_AGENT_PID") return true;
  if (upper.startsWith("GIT_") || upper.startsWith("SSH_") || upper.startsWith("GH_")) return true;
  if (upper === "EDITOR" || upper === "VISUAL" || upper === "PAGER" || upper === "NPM_TOKEN") return true;
  if (upper === "HOME" || upper === "USER" || upper === "LOGNAME" || upper === "USERNAME") return true;
  if (upper === "PATH") return true;
  for (const prefix of AGENT_EXEC_ENV_DROP_PREFIXES) {
    if (upper.startsWith(prefix) || key.startsWith(prefix)) return true;
  }
  return false;
}

export function classifyRequestedExecutionClass(value: unknown): AgentExecutionClass | null {
  if (
    value === "agent_readonly_inspect" ||
    value === "user_approved_project_code" ||
    value === "product_owned_fixed" ||
    value === "product_git_privileged" ||
    value === "product_provider_network" ||
    value === "user_interactive_pty"
  ) {
    return value;
  }
  return null;
}

export function collectAgentExecutionPolicyParity(): Record<string, unknown> {
  return {
    failureCodes: [...AGENT_EXECUTION_FAILURE_CODES],
    recipeIds: [...AGENT_INSPECT_RECIPE_IDS],
    envKeep: [...AGENT_EXEC_ENV_KEEP],
    envDropPrefixes: [...AGENT_EXEC_ENV_DROP_PREFIXES],
    gitConfig: [...GIT_INSPECT_CONFIG_ASSIGNMENTS],
    gitStatus: buildGitStatusArgv(),
    gitDiff: buildGitDiffArgv(),
    gitLog: buildGitLogArgv(GIT_INSPECT_LOG_DEFAULT),
    gitStatusPath: buildGitStatusArgv("README.md"),
    nodeVersion: planInspectRecipe("node_version"),
    npmVersion: planInspectRecipe("npm_version"),
    snapshot: buildAgentExecutionPolicySnapshot(),
    messages: Object.fromEntries(
      AGENT_EXECUTION_FAILURE_CODES.map((code) => [code, agentExecutionFailureMessage(code)]),
    ),
  };
}
