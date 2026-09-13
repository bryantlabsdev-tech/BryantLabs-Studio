import { accessSync, constants } from "node:fs";
import * as os from "node:os";
import * as path from "node:path";

/** macOS GUI apps often inherit a minimal PATH; prepend common tool locations. */
export const MACOS_PATH_FALLBACK =
  "/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin";

const NPM_CANDIDATES_MACOS = [
  "/opt/homebrew/bin/npm",
  "/usr/local/bin/npm",
  "npm",
] as const;

const NPX_CANDIDATES_MACOS = [
  "/opt/homebrew/bin/npx",
  "/usr/local/bin/npx",
  "npx",
] as const;

function pathExists(filePath: string, mode = constants.F_OK): boolean {
  try {
    accessSync(filePath, mode);
    return true;
  } catch {
    return false;
  }
}

export function buildSafePath(existing?: string): string {
  const delimiter = path.delimiter;
  const merged: string[] = [];
  const seen = new Set<string>();

  const pushSegment = (segment: string) => {
    for (const part of segment.split(delimiter)) {
      const trimmed = part.trim();
      if (!trimmed || seen.has(trimmed)) continue;
      seen.add(trimmed);
      merged.push(trimmed);
    }
  };

  pushSegment(existing ?? process.env.PATH ?? "");

  if (process.platform === "darwin") {
    pushSegment(MACOS_PATH_FALLBACK);
  } else if (process.platform !== "win32") {
    pushSegment("/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin");
  }

  return merged.join(delimiter);
}

export function spawnProcessEnv(
  extra?: Record<string, string | undefined>,
): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    PATH: buildSafePath(process.env.PATH),
  };
  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined) env[key] = value;
    }
  }
  return env;
}

export function resolveDefaultShell(): string {
  if (process.platform === "win32") {
    const comspec = process.env.COMSPEC?.trim();
    if (comspec) return comspec;
    return "powershell.exe";
  }
  if (process.platform === "darwin") {
    const preferred = process.env.SHELL?.trim();
    if (preferred && pathExists(preferred, constants.X_OK)) return preferred;
    return "/bin/zsh";
  }
  const preferred = process.env.SHELL?.trim();
  if (preferred && pathExists(preferred, constants.X_OK)) return preferred;
  return "/bin/bash";
}

export function resolveNpmCommand(): string {
  if (process.platform === "darwin") {
    for (const candidate of NPM_CANDIDATES_MACOS) {
      if (candidate === "npm") return candidate;
      if (pathExists(candidate, constants.X_OK)) return candidate;
    }
  }
  return "npm";
}

export function resolveNpxCommand(): string {
  if (process.platform === "darwin") {
    const npm = resolveNpmCommand();
    if (npm !== "npm") {
      const sibling = npm.replace(/npm$/, "npx");
      if (pathExists(sibling, constants.X_OK)) return sibling;
    }
    for (const candidate of NPX_CANDIDATES_MACOS) {
      if (candidate === "npx") return candidate;
      if (pathExists(candidate, constants.X_OK)) return candidate;
    }
  }
  return "npx";
}

export function resolveShellCommand(command: string): string {
  const trimmed = command.trim();
  if (process.platform !== "darwin") return trimmed;

  const npm = resolveNpmCommand();
  if (/^npm\b/.test(trimmed)) {
    return trimmed.replace(/^npm\b/, npm);
  }
  if (/^npx\b/.test(trimmed)) {
    return trimmed.replace(/^npx\b/, resolveNpxCommand());
  }
  return trimmed;
}

/** Split a resolved command into argv so callers can spawn without a shell. */
export function parseDirectSpawnCommand(command: string): {
  file: string;
  args: string[];
} {
  const parts = command.trim().split(/\s+/).filter(Boolean);
  let file = parts[0] ?? "npm";
  if (process.platform === "win32" && (file === "npm" || file === "npx")) {
    file = `${file}.cmd`;
  }
  return { file, args: parts.slice(1) };
}

export function resolveSpawnCwdSync(
  preferred: string | null | undefined,
  fallback?: string | null,
): { cwd: string; exists: boolean } {
  const candidates = [preferred, fallback, process.cwd(), os.homedir()].filter(
    (value): value is string => typeof value === "string" && value.trim().length > 0,
  );

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate.trim());
    if (pathExists(resolved)) {
      return { cwd: resolved, exists: true };
    }
  }

  const last = candidates[0] ?? os.homedir();
  return { cwd: path.resolve(last), exists: false };
}

export function packageJsonExists(root: string): boolean {
  return pathExists(path.join(root, "package.json"));
}

export interface SpawnDiagnostics {
  command: string;
  cwd: string;
  path: string;
  packageJsonExists: boolean;
}

export function buildSpawnDiagnostics(opts: {
  command: string;
  cwd: string;
}): SpawnDiagnostics {
  return {
    command: opts.command,
    cwd: opts.cwd,
    path: buildSafePath(process.env.PATH),
    packageJsonExists: packageJsonExists(opts.cwd),
  };
}

export function formatSpawnDiagnostics(diag: SpawnDiagnostics): string {
  return [
    `command=${diag.command}`,
    `cwd=${diag.cwd}`,
    `PATH=${diag.path}`,
    `package.json=${diag.packageJsonExists ? "yes" : "no"}`,
  ].join(" ");
}

export function logSpawnDiagnostics(
  diag: SpawnDiagnostics,
  tag = "spawn",
): void {
  console.log(`[${tag}] ${formatSpawnDiagnostics(diag)}`);
}

export function formatPosixSpawnError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err);
  if (/posix_spawnp|posix spawn|EACCES|ENOENT|spawn .* ENOENT/i.test(message)) {
    return "Could not start shell/process. Check PATH and command path.";
  }
  return message;
}

export function isSpawnEnoentError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err);
  return /ENOENT|spawn .* ENOENT|not found/i.test(message);
}

export function isNpmEnoentOutput(stdout: string, stderr: string): boolean {
  const combined = `${stdout}\n${stderr}`;
  return /ENOENT|npm ERR! code ENOENT|command not found|spawn .* ENOENT/i.test(
    combined,
  );
}

export function formatNpmInstallFailureMessage(opts: {
  cwd: string;
  stdout?: string;
  stderr?: string;
  spawnError?: unknown;
}): string {
  const missingPackageJson = !packageJsonExists(opts.cwd);
  const enoent =
    missingPackageJson ||
    isSpawnEnoentError(opts.spawnError) ||
    isNpmEnoentOutput(opts.stdout ?? "", opts.stderr ?? "");

  if (enoent) {
    return "npm command not found or project folder missing package.json.";
  }
  return "npm install failed.";
}
