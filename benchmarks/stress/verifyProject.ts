import { spawn } from "node:child_process";

export interface CommandRunResult {
  readonly command: string;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
}

export async function runShellCommand(
  command: string,
  cwd: string,
  timeoutMs = 300_000,
): Promise<CommandRunResult> {
  const started = performance.now();
  return new Promise((resolve) => {
    const child = spawn(command, {
      cwd,
      shell: true,
      env: { ...process.env, CI: "1" },
    });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGKILL");
    }, timeoutMs);

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve({
        command,
        exitCode: code,
        stdout,
        stderr,
        durationMs: Math.round(performance.now() - started),
        timedOut,
      });
    });
  });
}

export interface ProjectVerificationResult {
  readonly install: CommandRunResult;
  readonly typecheck: CommandRunResult;
  readonly build: CommandRunResult;
  readonly installOk: boolean;
  readonly typecheckOk: boolean;
  readonly buildOk: boolean;
}

export async function verifyProjectAt(root: string): Promise<ProjectVerificationResult> {
  const install = await runShellCommand("npm install", root, 600_000);
  const typecheck = await runShellCommand("npx tsc --noEmit", root);
  const build = await runShellCommand("npm run build", root);
  return {
    install,
    typecheck,
    build,
    installOk: install.exitCode === 0 && !install.timedOut,
    typecheckOk: typecheck.exitCode === 0 && !typecheck.timedOut,
    buildOk: build.exitCode === 0 && !build.timedOut,
  };
}
