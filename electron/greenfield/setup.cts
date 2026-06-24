import { spawn } from "node:child_process";
import { buildTypeScriptCheckDetails } from "./tscDiagnostics.cjs";
import {
  isNpmEtargetFailure,
  parseEtargetPackage,
  repairPackageJsonOnDiskForEtarget,
  sanitizePackageJsonOnDisk,
} from "./packageJsonSanitizer.cjs";

/**
 * Post-generation setup (Phase 10): npm install, then typecheck + build.
 * Renderer may run greenfield repair when typecheck/build fails (Phase 28).
 */

const OUTPUT_CAP = 200_000;
const INSTALL_TIMEOUT_MS = 600_000;
const TYPECHECK_TIMEOUT_MS = 120_000;
const BUILD_TIMEOUT_MS = 300_000;

export interface CommandResult {
  command: string;
  ok: boolean;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  errorCount: number;
  warningCount: number;
  timedOut: boolean;
  truncated: boolean;
}

export interface GreenfieldSetupResult {
  ok: boolean;
  install: CommandResult;
  typecheck?: CommandResult;
  /** Full TypeScript failure details when typecheck does not pass. */
  typecheckDetails?: import("./tscDiagnostics.cjs").TypeScriptCheckDetails;
  build?: CommandResult;
  error?: string;
  /** package.json fixes applied before or during npm install. */
  dependencyRepairs?: string[];
  /** True when npm install was retried after an ETARGET repair. */
  installRetried?: boolean;
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function parseCommandFirstError(cmd: CommandResult): string | null {
  const combined = `${cmd.stderr}\n${cmd.stdout}`;
  const lines = combined.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/error TS\d+/i.test(line)) return line;
    if (/^\s*error\s/i.test(line)) return line;
    if (/failed|ERROR|✘|×/i.test(line) && line.length < 500) return line;
    if (/:\d+:\d+/.test(line) && /error/i.test(line)) return line;
  }
  return lines[0] ?? null;
}

function formatCommandFailure(label: string, cmd: CommandResult): string {
  if (cmd.timedOut) {
    return `${label} timed out after ${Math.round(cmd.durationMs / 1000)}s.`;
  }
  const first = parseCommandFirstError(cmd);
  const exit = cmd.exitCode ?? "—";
  return first ? `${label} failed — exit ${exit} — ${first}` : `${label} failed — exit ${exit}.`;
}

export function runGreenfieldCommand(
  command: string,
  root: string,
  timeoutMs: number,
): Promise<CommandResult> {
  return new Promise((resolve) => {
    const start = Date.now();
    let stdout = "";
    let stderr = "";
    let truncated = false;
    let timedOut = false;
    let settled = false;

    const append = (target: "out" | "err", chunk: string) => {
      if (target === "out") {
        if (stdout.length < OUTPUT_CAP) stdout += chunk;
        else truncated = true;
      } else {
        if (stderr.length < OUTPUT_CAP) stderr += chunk;
        else truncated = true;
      }
    };

    const env = {
      ...process.env,
      PATH: `${process.env.PATH ?? ""}:/usr/local/bin:/opt/homebrew/bin`,
      CI: "1",
      FORCE_COLOR: "0",
    };

    const child = spawn(command, {
      cwd: root,
      shell: true,
      env,
      windowsHide: true,
    });

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    const finish = (exitCode: number | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const combined = `${stdout}\n${stderr}`;
      resolve({
        command,
        ok: exitCode === 0 && !timedOut,
        exitCode,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        errorCount: countMatches(combined, /error TS\d+/g),
        warningCount: countMatches(combined, /warning TS\d+/g),
        timedOut,
        truncated,
      });
    };

    child.stdout?.on("data", (d: Buffer) => append("out", d.toString()));
    child.stderr?.on("data", (d: Buffer) => append("err", d.toString()));
    child.on("error", (err) => {
      append("err", `\n${String(err)}`);
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}

export async function runGreenfieldSetup(
  root: string,
): Promise<GreenfieldSetupResult> {
  const dependencyRepairs: string[] = [];
  const preSanitize = await sanitizePackageJsonOnDisk(root);
  if (preSanitize.repairs.length > 0) {
    dependencyRepairs.push(...preSanitize.repairs);
  }

  let install = await runGreenfieldCommand("npm install", root, INSTALL_TIMEOUT_MS);
  let installRetried = false;

  if (!install.ok && isNpmEtargetFailure(install.stdout, install.stderr)) {
    const target = parseEtargetPackage(install.stdout, install.stderr);
    if (target) {
      const repaired = await repairPackageJsonOnDiskForEtarget(root, target.packageName);
      if (repaired.changed) {
        dependencyRepairs.push(...repaired.repairs);
        installRetried = true;
        install = await runGreenfieldCommand("npm install", root, INSTALL_TIMEOUT_MS);
      }
    }
  }

  if (!install.ok) {
    return {
      ok: false,
      install,
      error: formatCommandFailure("npm install", install),
      ...(dependencyRepairs.length > 0 ? { dependencyRepairs } : {}),
      ...(installRetried ? { installRetried: true } : {}),
    };
  }

  const typecheck = await runGreenfieldTypecheck(root);
  if (!typecheck.ok) {
    const typecheckDetails = buildTypeScriptCheckDetails(typecheck);
    const n = typecheckDetails.diagnostics.filter((d) => d.category === "error")
      .length;
    return {
      ok: false,
      install,
      typecheck,
      typecheckDetails,
      error:
        n > 0
          ? `TypeScript check failed (${n} error${n === 1 ? "" : "s"}).`
          : "TypeScript check failed.",
      ...(dependencyRepairs.length > 0 ? { dependencyRepairs } : {}),
      ...(installRetried ? { installRetried: true } : {}),
    };
  }

  const build = await runGreenfieldBuild(root);
  if (!build.ok) {
    return {
      ok: false,
      install,
      typecheck,
      build,
      error: formatCommandFailure("Build", build),
      ...(dependencyRepairs.length > 0 ? { dependencyRepairs } : {}),
      ...(installRetried ? { installRetried: true } : {}),
    };
  }

  return {
    ok: true,
    install,
    typecheck,
    build,
    ...(dependencyRepairs.length > 0 ? { dependencyRepairs } : {}),
    ...(installRetried ? { installRetried: true } : {}),
  };
}

export async function runGreenfieldTypecheck(root: string): Promise<CommandResult> {
  return runGreenfieldCommand("npx tsc --noEmit", root, TYPECHECK_TIMEOUT_MS);
}

export async function runGreenfieldBuild(root: string): Promise<CommandResult> {
  return runGreenfieldCommand("npm run build", root, BUILD_TIMEOUT_MS);
}
