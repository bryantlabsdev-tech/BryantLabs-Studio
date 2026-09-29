import { spawn } from "node:child_process";
import { closeSync, constants, fstatSync, lstatSync, openSync, realpathSync } from "node:fs";
import * as path from "node:path";

/**
 * Project typecheck never invokes npx. npx can download the unrelated `tsc`
 * package and report a successful install instead of TypeScript diagnostics.
 *
 * The process always runs `typescript/lib/tsc.js` after that file's real path
 * is confirmed to be a regular file inside this project's
 * `node_modules/typescript` package. `bin/tsc` is only a launcher that
 * require()s `../lib/tsc.js`, so it is never executed. A trusted bin entry
 * only marks the resolution as project-local. Anything else, including a
 * symlink that leaves the project, is unavailable.
 */

const OUTPUT_CAP = 200_000;

export const TYPECHECK_COMPILER_UNAVAILABLE_MESSAGE =
  "TypeScript compiler unavailable: no trusted project-local tsc. Refusing to download or substitute a compiler.";

export interface TypecheckCommandResult {
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
  /** True when no trusted compiler exists. npx is not consulted. */
  unavailableTool?: boolean;
}

export interface ResolvedTypeScriptCompiler {
  readonly kind: "project-local" | "typescript-lib";
  readonly executable: string;
  readonly scriptPath: string;
  readonly args: readonly ["--noEmit", "--pretty", "false"];
  readonly command: string;
}

function isInsideDir(parent: string, child: string): boolean {
  const rel = path.relative(parent, child);
  if (rel === "") return true;
  return rel !== ".." && !rel.startsWith(`..${path.sep}`) && !path.isAbsolute(rel);
}

function tryRealpath(filePath: string): string | null {
  try {
    return realpathSync(filePath);
  } catch {
    return null;
  }
}

function acceptTrustedScript(candidate: string, projectReal: string, packageReal: string): string | null {
  let listed: ReturnType<typeof lstatSync>;
  try {
    listed = lstatSync(candidate);
  } catch {
    return null;
  }
  if (!listed.isFile() && !listed.isSymbolicLink()) return null;
  const real = tryRealpath(candidate);
  if (!real) return null;
  if (!isInsideDir(projectReal, real) || !isInsideDir(packageReal, real)) return null;
  let resolved: ReturnType<typeof lstatSync>;
  try {
    resolved = lstatSync(real);
  } catch {
    return null;
  }
  if (!resolved.isFile() || resolved.isSymbolicLink()) return null;
  const base = path.basename(real);
  const parent = path.basename(path.dirname(real));
  const packageDir = path.dirname(path.dirname(real));
  if (packageDir !== packageReal) return null;
  if (parent === "bin" && base === "tsc") return real;
  if (parent === "lib" && base === "tsc.js") return real;
  return null;
}

export function resolveProjectTypeScriptCompiler(
  projectRoot: string,
): ResolvedTypeScriptCompiler | null {
  const root = path.resolve(projectRoot);
  const projectReal = tryRealpath(root);
  if (!projectReal) return null;
  const packageDir = path.join(root, "node_modules", "typescript");
  const packageReal = tryRealpath(packageDir);
  if (!packageReal || !isInsideDir(projectReal, packageReal)) return null;

  const libPath = acceptTrustedScript(
    path.join(packageDir, "lib", "tsc.js"),
    projectReal,
    packageReal,
  );
  if (!libPath) return null;

  const binCandidates = [
    path.join(root, "node_modules", ".bin", "tsc"),
    path.join(packageDir, "bin", "tsc"),
  ];
  const binTrusted = binCandidates.some(
    (candidate) => acceptTrustedScript(candidate, projectReal, packageReal) !== null,
  );
  return describeCompiler(binTrusted ? "project-local" : "typescript-lib", libPath);
}

/** Child env cannot select a compiler or inject a Node preload. */
export function compilerChildEnv(): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    CI: "1",
    FORCE_COLOR: "0",
    ELECTRON_RUN_AS_NODE: "1",
  };
  if (process.platform === "win32") {
    const root = process.env.SystemRoot ?? process.env.SYSTEMROOT;
    if (root && /^[A-Za-z]:\\Windows$/i.test(root)) {
      env.SystemRoot = root;
      env.SYSTEMROOT = root;
      env.WINDIR = root;
    }
  }
  return env;
}

function describeCompiler(
  kind: ResolvedTypeScriptCompiler["kind"],
  scriptPath: string,
): ResolvedTypeScriptCompiler {
  const args = ["--noEmit", "--pretty", "false"] as const;
  return {
    kind,
    executable: process.execPath,
    scriptPath,
    args,
    command: [process.execPath, scriptPath, ...args].join(" "),
  };
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

export function unavailableTypecheckResult(): TypecheckCommandResult {
  return {
    command: "tsc --noEmit",
    ok: false,
    exitCode: null,
    stdout: "",
    stderr: TYPECHECK_COMPILER_UNAVAILABLE_MESSAGE,
    durationMs: 0,
    errorCount: 0,
    warningCount: 0,
    timedOut: false,
    truncated: false,
    unavailableTool: true,
  };
}

function openRegularScript(scriptPath: string): number | null {
  const noFollow = constants.O_NOFOLLOW;
  const flags = typeof noFollow === "number" ? constants.O_RDONLY | noFollow : constants.O_RDONLY;
  let fd: number;
  try {
    fd = openSync(scriptPath, flags);
  } catch {
    return null;
  }
  try {
    const stat = fstatSync(fd);
    if (!stat.isFile()) {
      closeSync(fd);
      return null;
    }
    return fd;
  } catch {
    closeSync(fd);
    return null;
  }
}

export function runProjectTypecheck(
  projectRoot: string,
  timeoutMs: number,
): Promise<TypecheckCommandResult> {
  const resolved = resolveProjectTypeScriptCompiler(projectRoot);
  if (!resolved || resolved.executable !== process.execPath) {
    return Promise.resolve(unavailableTypecheckResult());
  }
  const confirmed = resolveProjectTypeScriptCompiler(projectRoot);
  if (
    !confirmed ||
    confirmed.scriptPath !== resolved.scriptPath ||
    confirmed.executable !== process.execPath ||
    !confirmed.scriptPath.endsWith(`${path.sep}typescript${path.sep}lib${path.sep}tsc.js`)
  ) {
    return Promise.resolve(unavailableTypecheckResult());
  }
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
      } else if (stderr.length < OUTPUT_CAP) stderr += chunk;
      else truncated = true;
    };

    const again = resolveProjectTypeScriptCompiler(projectRoot);
    const scriptFd = again && again.scriptPath === confirmed.scriptPath
      ? openRegularScript(again.scriptPath)
      : null;
    if (!again || scriptFd === null) {
      resolve(unavailableTypecheckResult());
      return;
    }
    closeSync(scriptFd);

    const child = spawn(again.executable, [again.scriptPath, ...again.args], {
      cwd: path.resolve(projectRoot),
      shell: false,
      env: compilerChildEnv(),
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
        command: confirmed.command,
        ok: exitCode === 0 && !timedOut,
        exitCode,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        errorCount: countMatches(combined, /error TS\d+/g),
        warningCount: countMatches(combined, /warning TS\d+/g),
        timedOut,
        truncated,
        unavailableTool: false,
      });
    };

    child.stdout?.on("data", (d: Buffer) => append("out", d.toString()));
    child.stderr?.on("data", (d: Buffer) => append("err", d.toString()));
    child.on("error", (err) => {
      append("err", `\n${err instanceof Error ? err.message : String(err)}`);
      finish(null);
    });
    child.on("close", (code) => finish(code));
  });
}
