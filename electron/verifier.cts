import { spawn } from "node:child_process";

/**
 * Build & verification runner (Phase 6).
 *
 * Runs exactly two fixed, well-known commands in the active project root:
 *   - `npx tsc --noEmit`  (type-check)
 *   - `npm run build`     (build)
 * It captures stdout/stderr, the exit code, and the duration. It performs NO
 * auto-fixing and NO AI. The command strings are constants — only the working
 * directory varies — so there is no arbitrary command execution.
 */

const OUTPUT_CAP = 200_000; // chars retained per stream
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

export interface VerificationResult {
  typecheck: CommandResult;
  build: CommandResult;
  ranAt: number;
}

function countMatches(text: string, pattern: RegExp): number {
  return (text.match(pattern) ?? []).length;
}

function runCommand(
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
      // Mitigate the minimal PATH a GUI-launched app may inherit on macOS.
      PATH: `${process.env.PATH ?? ""}:/usr/local/bin:/opt/homebrew/bin`,
      // Keep output stable and non-interactive.
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

/** Type-check only — used by the live Problems panel (no build). */
export async function runTypecheckOnly(root: string): Promise<CommandResult> {
  return runCommand("npx tsc --noEmit", root, TYPECHECK_TIMEOUT_MS);
}

export async function runVerification(root: string): Promise<VerificationResult> {
  const typecheck = await runTypecheckOnly(root);
  const build = await runCommand("npm run build", root, BUILD_TIMEOUT_MS);
  return { typecheck, build, ranAt: Date.now() };
}
