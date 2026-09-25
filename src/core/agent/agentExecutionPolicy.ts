/**
 * Application-enforced Agent execution policy (not a kernel, container, or OS sandbox).
 *
 * Electron main cannot import this file (electron/tsconfig rootDir is electron/).
 * Keep electron/agentExecutionPolicy.cts in lockstep. CI fails if the copies diverge
 * after import-path normalization. Shared vectors plus collectAgentExecutionPolicyParity
 * cover recipes, argv, failure codes, env rules, and snapshot text.
 *
 * Autonomous agents may only run inspect recipes. A Node script inside the open
 * project may run only after a visible, single-use approval. An existing
 * package.json script may run only after a separate visible approval of that
 * script name and body. npx, npm install, publishing, lifecycle hooks, local
 * binaries, Git push/branch/worktree, provider networking, interactive PTY,
 * greenfield, and preview stay on their existing authority paths.
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
export const PROJECT_CODE_APPROVAL_TTL_MS = 15_000;
export const PROJECT_CODE_MAX_ARGS = 8;
export const PROJECT_CODE_ARG_MAX_CHARS = 200;
export const PROJECT_CODE_NETWORK_LIMITATION =
  "Network is not limited. Project code can open connections and read or write files. This confirmation is not an OS, network, filesystem, container, or VM sandbox.";
export const PROJECT_CODE_RISK_TEXT =
  "Project code can access files and the network. Approve only this exact executable, these arguments, and this working directory.";
export const PROJECT_CODE_PATH_BEHAVIOR =
  "Studio runs the exact approved bytes from a private copy outside the project. __filename, __dirname, import.meta.url, and relative imports refer to that copy, not the project file. The working directory remains the project root. Arguments after the script are the arguments shown here.";
export const PROJECT_CODE_SCRIPT_EXTENSIONS = [".js", ".mjs", ".cjs"] as const;
export const PACKAGE_SCRIPT_APPROVAL_TTL_MS = 15_000;
export const PACKAGE_SCRIPT_NAMES = ["build", "test", "typecheck", "lint"] as const;
export const PACKAGE_SCRIPT_BODY_MAX_CHARS = 4_000;
export const PACKAGE_SCRIPT_SHELL_WARNING =
  "On macOS and Linux, the exact script body shown here runs with shell semantics through /bin/sh -c. It may invoke local binaries from node_modules/.bin, nested npm or npx commands, network clients, subprocesses, and filesystem operations. Local binaries and downstream project files are not content-bound and can change independently of this approval. This confirmation is not an OS, filesystem, process, or network sandbox. Studio does not run npm, and it does not pass script arguments.";
export const PACKAGE_SCRIPT_SHELL_WARNING_WINDOWS =
  "On Windows, the exact script body shown here runs with cmd.exe shell semantics through C:\\Windows\\System32\\cmd.exe or C:\\Windows\\Sysnative\\cmd.exe as cmd.exe /d /s /c. Studio discovers that shell only through C:\\Windows\\System32\\reg.exe, and only when HKLM SystemRoot canonicalizes to C:\\Windows. /d disables AutoRun. cmd.exe parses the approved body with Windows command-line rules. It may invoke local binaries from node_modules/.bin, nested npm or npx commands, network clients, subprocesses, and filesystem operations. Local binaries and downstream project files are not content-bound and can change independently of this approval. This confirmation is not an OS, filesystem, process, or network sandbox. Studio does not run npm, does not trust COMSPEC, PATH, SystemRoot, or WINDIR, and does not pass script arguments.";
export const PACKAGE_SCRIPT_ENVIRONMENT_TEXT =
  "The child receives the inspect environment allowlist. PATH is only the project's node_modules/.bin plus trusted system directories. On Windows those directories are C:\\Windows\\System32 and C:\\Windows, COMSPEC is the verified cmd.exe, and PATHEXT is fixed. Inherited PATH, COMSPEC, SystemRoot, WINDIR, NODE_OPTIONS, NPM_CONFIG_*, credentials, and proxy variables are not passed. A project .npmrc is rejected. Lifecycle hooks are not run.";

export type AgentExecutionClass =
  | "agent_readonly_inspect"
  | "user_approved_project_code"
  | "user_approved_package_script"
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
  | "script_identity_changed"
  | "package_manifest_changed"
  | "lockfile_changed"
  | "lifecycle_not_allowed"
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
  "script_identity_changed",
  "package_manifest_changed",
  "lockfile_changed",
  "lifecycle_not_allowed",
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

export interface AgentProjectCodePlan {
  readonly ok: true;
  readonly executionClass: "user_approved_project_code";
  readonly executable: "node";
  readonly argv: readonly string[];
  readonly network: "not_isolated";
  readonly timeoutMs: number;
  readonly maxOutputChars: number;
  readonly cwdBinding: "canonical_project_root";
  readonly networkLimitation: string;
  readonly risk: string;
  readonly planKey: string;
}

export interface AgentProjectCodeDenied {
  readonly ok: false;
  readonly executionClass: "user_approved_project_code";
  readonly code: AgentExecutionFailureCode;
  readonly message: string;
}

export type AgentProjectCodeDecision = AgentProjectCodePlan | AgentProjectCodeDenied;

export type PackageScriptName = (typeof PACKAGE_SCRIPT_NAMES)[number];

export interface AgentPackageScriptPlan {
  readonly ok: true;
  readonly executionClass: "user_approved_package_script";
  readonly executable: "/bin/sh" | "cmd.exe";
  readonly scriptName: PackageScriptName;
  readonly argv: readonly string[];
  readonly network: "not_isolated";
  readonly timeoutMs: number;
  readonly maxOutputChars: number;
  readonly cwdBinding: "canonical_project_root";
  readonly shellWarning: string;
  readonly environmentPolicy: string;
  readonly planKey: string;
}

export interface AgentPackageScriptDenied {
  readonly ok: false;
  readonly executionClass: "user_approved_package_script";
  readonly code: AgentExecutionFailureCode;
  readonly message: string;
}

export type AgentPackageScriptDecision = AgentPackageScriptPlan | AgentPackageScriptDenied;

export interface AgentExecutionApprovalRecord {
  readonly at: number;
  readonly outcome: "approved" | "denied";
  readonly code: string;
  readonly executionClass: AgentExecutionClass;
  readonly reason: string;
  readonly ownerId: number;
}

export interface AgentExecutionPolicySnapshot {
  readonly label: string;
  readonly isolationLevel: typeof AGENT_EXECUTION_ISOLATION_LEVEL;
  readonly osSandboxClaimed: false;
  readonly kernelFirewall: false;
  readonly autonomousInspection: string;
  readonly approvedProjectCode: string;
  readonly approvedPackageScripts: string;
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
    case "script_identity_changed":
      return "The project script changed after it was previewed.";
    case "package_manifest_changed":
      return "package.json changed after it was previewed.";
    case "lockfile_changed":
      return "The package lockfile changed after it was previewed.";
    case "lifecycle_not_allowed":
      return "Lifecycle, install, publish, and server scripts are not available on this approval.";
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
      "Approved project-code execution is not network-isolated. A Node script runs only after a visible confirmation of the exact executable, arguments, working directory, network limitation, timeout, and script digest. Studio runs those approved bytes from a private copy; __filename, __dirname, and relative imports refer to that copy, not the project file. The working directory remains the project root. Project code can access files and the network. It is not available to autonomous agents.",
    approvedPackageScripts:
      "Approved package scripts are not OS, filesystem, process, or network isolated. Only an existing package.json script named build, test, typecheck, or lint can run, and only after a visible confirmation of the exact script body. On macOS and Linux, Studio runs that body with shell semantics through trusted /bin/sh -c. On Windows, Studio runs that body as cmd.exe /d /s /c through C:\\Windows\\System32\\cmd.exe or C:\\Windows\\Sysnative\\cmd.exe, discovered only through C:\\Windows\\System32\\reg.exe when HKLM SystemRoot canonicalizes to C:\\Windows. It does not trust COMSPEC, PATH, SystemRoot, or WINDIR. It does not invoke npm and it does not pass script arguments. The body may invoke local binaries, nested npm or npx, network clients, subprocesses, and filesystem operations. Local binaries and downstream project files are not content-bound. npm install, publishing, lifecycle hooks, preview, dev, and server commands are not this approval. Autonomous agents cannot run them.",
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
      "npx, npm install, publishing, lifecycle hooks, and local binaries (not this approval; not autonomous)",
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
    value === "user_approved_package_script" ||
    value === "product_owned_fixed" ||
    value === "product_git_privileged" ||
    value === "product_provider_network" ||
    value === "user_interactive_pty"
  ) {
    return value;
  }
  return null;
}

function projectCodeDeny(code: AgentExecutionFailureCode): AgentProjectCodeDenied {
  return {
    ok: false,
    executionClass: "user_approved_project_code",
    code,
    message: agentExecutionFailureMessage(code),
  };
}

function isSafeProjectCodeArgument(token: string): boolean {
  if (typeof token !== "string" || token.length === 0 || token.length > PROJECT_CODE_ARG_MAX_CHARS) return false;
  if (CONTROL_OR_NUL.test(token) || SHELL_METACHAR.test(token)) return false;
  if (token.includes("..") || token.startsWith("/") || /^[a-zA-Z]:/.test(token)) return false;
  if (token.includes("://") || token.startsWith("@")) return false;
  return true;
}

/** Stable description of the child environment. Values from the process environment are not included. */
export function projectCodeEnvironmentPolicyKey(): string {
  return JSON.stringify({
    keep: [...AGENT_EXEC_ENV_KEEP],
    dropPrefixes: [...AGENT_EXEC_ENV_DROP_PREFIXES],
    path: "trusted-inspect-directories-plus-executable-directory",
    forced: {
      TERM: "dumb",
      NO_COLOR: "1",
      CI: "1",
      GIT_TERMINAL_PROMPT: "0",
      GIT_CONFIG_NOSYSTEM: "1",
      GIT_CONFIG_GLOBAL: "/dev/null",
      GIT_CONFIG_SYSTEM: "/dev/null",
      GIT_PAGER: "cat",
      GIT_EDITOR: "true",
      GIT_OPTIONAL_LOCKS: "0",
      GIT_EXTERNAL_DIFF: "",
      GIT_ASKPASS: "",
      GIT_SSH_COMMAND: "",
    },
  });
}

function projectCodePlanKey(argv: readonly string[]): string {
  return JSON.stringify({
    executable: "node",
    argv,
    cwdBinding: "canonical_project_root",
    network: "not_isolated",
    timeoutMs: AGENT_COMMAND_TIMEOUT_MS,
    maxOutputChars: AGENT_COMMAND_OUTPUT_CHARS,
    environmentPolicy: projectCodeEnvironmentPolicyKey(),
  });
}

/**
 * Structured project-code plan. Not used by autonomous command routing.
 * Rejects shell metacharacters, command substitution, and extra fields.
 */
export function planProjectCodeRequest(payload: unknown): AgentProjectCodeDecision {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return projectCodeDeny("invalid_request");
  }
  const record = payload as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "script" && key !== "args") return projectCodeDeny("invalid_request");
  }
  const script = record.script;
  if (typeof script !== "string" || !isSafeAgentRelativePath(script) || SHELL_METACHAR.test(script)) {
    return projectCodeDeny("arguments_not_allowed");
  }
  const lower = script.toLowerCase();
  if (lower.split("/").includes("node_modules")) return projectCodeDeny("executable_not_allowed");
  if (!PROJECT_CODE_SCRIPT_EXTENSIONS.some((ext) => lower.endsWith(ext))) {
    return projectCodeDeny("executable_not_allowed");
  }
  let args: string[] = [];
  if (record.args !== undefined) {
    if (!Array.isArray(record.args) || record.args.length > PROJECT_CODE_MAX_ARGS) {
      return projectCodeDeny("arguments_not_allowed");
    }
    for (const arg of record.args) {
      if (typeof arg !== "string" || !isSafeProjectCodeArgument(arg)) {
        return projectCodeDeny("arguments_not_allowed");
      }
    }
    args = [...record.args];
  }
  const argv = [script, ...args];
  return {
    ok: true,
    executionClass: "user_approved_project_code",
    executable: "node",
    argv,
    network: "not_isolated",
    timeoutMs: AGENT_COMMAND_TIMEOUT_MS,
    maxOutputChars: AGENT_COMMAND_OUTPUT_CHARS,
    cwdBinding: "canonical_project_root",
    networkLimitation: PROJECT_CODE_NETWORK_LIMITATION,
    risk: PROJECT_CODE_RISK_TEXT,
    planKey: projectCodePlanKey(argv),
  };
}

const PACKAGE_SCRIPT_LIFECYCLE = new Set([
  "install",
  "uninstall",
  "preinstall",
  "postinstall",
  "prepare",
  "preprepare",
  "postprepare",
  "prepublish",
  "prepublishOnly",
  "publish",
  "postpublish",
  "prepack",
  "postpack",
  "preuninstall",
  "postuninstall",
  "dependencies",
  "predependencies",
  "postdependencies",
]);

const PACKAGE_SCRIPT_BLOCKED = new Set([
  "dev",
  "start",
  "serve",
  "server",
  "preview",
  "watch",
  "update",
  "ci",
  "pack",
  "explore",
  "exec",
  "npx",
]);

function packageScriptDeny(code: AgentExecutionFailureCode): AgentPackageScriptDenied {
  return {
    ok: false,
    executionClass: "user_approved_package_script",
    code,
    message: agentExecutionFailureMessage(code),
  };
}

export function isAllowedPackageScriptName(value: string): value is PackageScriptName {
  return (PACKAGE_SCRIPT_NAMES as readonly string[]).includes(value);
}

export const PACKAGE_SCRIPT_POSIX_ARGV = ["-c"] as const;
export const PACKAGE_SCRIPT_WINDOWS_ARGV = ["/d", "/s", "/c"] as const;

/** True only for C:\\Windows\\System32 or C:\\Windows\\Sysnative cmd.exe. */
export function isTrustedWindowsSystemShellPath(candidate: string): boolean {
  if (typeof candidate !== "string" || candidate.length === 0 || candidate.length > 260) return false;
  const normalized = candidate.replace(/\//g, "\\");
  return /^C:\\Windows\\(System32|Sysnative)\\cmd\.exe$/i.test(normalized);
}

export function packageScriptShellWarning(platform: "win32" | "posix"): string {
  return platform === "win32" ? PACKAGE_SCRIPT_SHELL_WARNING_WINDOWS : PACKAGE_SCRIPT_SHELL_WARNING;
}

/** Approval key for the captured body. Main fills the body digest, PATH, shell path, and argv prefix. */
export function packageScriptPlanKey(input: {
  readonly scriptName: string;
  readonly scriptBodySha256: string;
  readonly pathValue: string;
  readonly shellPath: string;
  readonly argvPrefix: readonly string[];
}): string {
  return JSON.stringify({
    executable: input.argvPrefix[0] === "/d" ? "cmd.exe" : "/bin/sh",
    argv: input.argvPrefix,
    scriptName: input.scriptName,
    scriptBodySha256: input.scriptBodySha256,
    arguments: "rejected",
    cwdBinding: "canonical_project_root",
    network: "not_isolated",
    timeoutMs: AGENT_COMMAND_TIMEOUT_MS,
    maxOutputChars: AGENT_COMMAND_OUTPUT_CHARS,
    environmentPolicy: projectCodeEnvironmentPolicyKey(),
    path: input.pathValue,
    shell: input.shellPath,
  });
}

/**
 * Structured package-script plan. The renderer may supply only a script name.
 * Arguments are rejected. Main reads package.json. Not used by autonomous routing.
 */
export function planPackageScriptRequest(payload: unknown): AgentPackageScriptDecision {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return packageScriptDeny("invalid_request");
  }
  const record = payload as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key === "args" || key === "arguments" || key === "argv") return packageScriptDeny("arguments_not_allowed");
    if (key !== "script") return packageScriptDeny("invalid_request");
  }
  const script = record.script;
  if (typeof script !== "string" || script.length === 0 || script.length > 64) {
    return packageScriptDeny("arguments_not_allowed");
  }
  if (CONTROL_OR_NUL.test(script) || SHELL_METACHAR.test(script) || script.includes("/") || script.includes("\\")) {
    return packageScriptDeny("arguments_not_allowed");
  }
  if (script.startsWith("-") || script.includes("=") || script.includes(" ")) {
    return packageScriptDeny("arguments_not_allowed");
  }
  const lower = script.toLowerCase();
  if (
    PACKAGE_SCRIPT_LIFECYCLE.has(script) ||
    PACKAGE_SCRIPT_BLOCKED.has(lower) ||
    lower.startsWith("pre") ||
    lower.startsWith("post") ||
    lower.includes("install") ||
    lower.includes("publish") ||
    lower.includes("npx") ||
    lower.includes("exec")
  ) {
    return packageScriptDeny("lifecycle_not_allowed");
  }
  if (!isAllowedPackageScriptName(script)) return packageScriptDeny("execution_not_allowed");
  return {
    ok: true,
    executionClass: "user_approved_package_script",
    executable: "/bin/sh",
    scriptName: script,
    argv: ["-c"],
    network: "not_isolated",
    timeoutMs: AGENT_COMMAND_TIMEOUT_MS,
    maxOutputChars: AGENT_COMMAND_OUTPUT_CHARS,
    cwdBinding: "canonical_project_root",
    shellWarning: PACKAGE_SCRIPT_SHELL_WARNING,
    environmentPolicy: PACKAGE_SCRIPT_ENVIRONMENT_TEXT,
    planKey: packageScriptPlanKey({
      scriptName: script,
      scriptBodySha256: "captured-by-main",
      pathValue: "project-node-modules-bin-plus-trusted-system-path",
      shellPath: "/bin/sh",
      argvPrefix: PACKAGE_SCRIPT_POSIX_ARGV,
    }),
  };
}

export function parsePackageScriptExecutionToken(
  payload: unknown,
): { readonly ok: true; readonly token: string } | AgentPackageScriptDenied {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return packageScriptDeny("invalid_request");
  }
  const record = payload as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "token") return packageScriptDeny("approval_invalid");
  }
  const token = record.token;
  if (typeof token !== "string" || !/^[a-f0-9]{32}$/.test(token)) {
    return packageScriptDeny("approval_invalid");
  }
  return { ok: true, token };
}

/** Execution accepts only a main-minted token. Extra fields are an altered approval. */
export function parseProjectCodeExecutionToken(
  payload: unknown,
): { readonly ok: true; readonly token: string } | AgentProjectCodeDenied {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return projectCodeDeny("invalid_request");
  }
  const record = payload as Record<string, unknown>;
  for (const key of Object.keys(record)) {
    if (key !== "token") return projectCodeDeny("approval_invalid");
  }
  const token = record.token;
  if (typeof token !== "string" || !/^[a-f0-9]{32}$/.test(token)) {
    return projectCodeDeny("approval_invalid");
  }
  return { ok: true, token };
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
    projectCodePlan: planProjectCodeRequest({ script: "scripts/hello.js", args: ["ok"] }),
    projectCodeSubstitution: planProjectCodeRequest({ script: "scripts/hello.js", args: ["$(id)"] }),
    packageScriptPlan: planPackageScriptRequest({ script: "test" }),
    packageScriptInstall: planPackageScriptRequest({ script: "install" }),
    packageScriptDev: planPackageScriptRequest({ script: "dev" }),
    packageScriptArguments: planPackageScriptRequest({ script: "test", args: ["ok"] }),
    windowsCmdTrusted: isTrustedWindowsSystemShellPath("C:\\Windows\\System32\\cmd.exe"),
    windowsCmdComspec: isTrustedWindowsSystemShellPath("C:\\evil\\cmd.exe"),
    windowsArgv: [...PACKAGE_SCRIPT_WINDOWS_ARGV],
    messages: Object.fromEntries(
      AGENT_EXECUTION_FAILURE_CODES.map((code) => [code, agentExecutionFailureMessage(code)]),
    ),
  };
}
