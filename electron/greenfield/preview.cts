import { spawn, type ChildProcess } from "node:child_process";
import * as http from "node:http";
import {
  buildPreviewDiagnostics,
  collectPreviewProjectContext,
  DEFAULT_PREVIEW_PORT,
  isPortInUse,
  pickPreviewPort,
  previewCommand,
  type PreviewDiagnosticsPayload,
} from "./previewDiagnostics.cjs";
import {
  extractPreviewUrl,
  normalizePreviewUrl,
  previewUrlForPort,
} from "./previewUrlParse.cjs";

export { normalizePreviewUrl, extractPreviewUrl } from "./previewUrlParse.cjs";

/**
 * Vite preview for a generated app (Phase 10). Spawns `npm run preview` in the
 * project root and parses the local URL from stdout. Single preview at a time.
 */

const START_WAIT_MS = 30_000;
const POLL_INTERVAL_MS = 400;

let previewProc: ChildProcess | null = null;
let previewUrl: string | null = null;
let previewRoot: string | null = null;
let previewPort: number = DEFAULT_PREVIEW_PORT;
let lastSuccessfulPreviewAt: string | null = null;
let lastFailureDiagnostics: PreviewDiagnosticsPayload | null = null;

export type { PreviewDiagnosticsPayload } from "./previewDiagnostics.cjs";

export interface PreviewStartResult {
  ok: boolean;
  url?: string;
  error?: string;
  diagnostics?: PreviewDiagnosticsPayload;
}

export type PreviewProbeErrorKind =
  | "none"
  | "econnrefused"
  | "timeout"
  | "unreachable"
  | "http_error"
  | "unknown";

export interface PreviewProbeResult {
  ok: boolean;
  httpStatus: number | null;
  contentType: string | null;
  error?: string;
  errorKind: PreviewProbeErrorKind;
  probedAt: string;
}

export function classifyProbeError(error: string): PreviewProbeErrorKind {
  const msg = error.toLowerCase();
  if (msg.includes("econnrefused") || msg.includes("connection refused")) {
    return "econnrefused";
  }
  if (msg.includes("etimedout") || msg.includes("timed out")) {
    return "timeout";
  }
  if (
    msg.includes("enotfound") ||
    msg.includes("ehostunreach") ||
    msg.includes("enetunreach") ||
    msg.includes("connect")
  ) {
    return "unreachable";
  }
  return "unknown";
}

export function previewPortFromUrl(url: string | null): number {
  if (!url) return previewPort;
  try {
    const p = new URL(url).port;
    return p ? Number(p) : previewPort;
  } catch {
    return previewPort;
  }
}

export function probePreviewUrl(url: string): Promise<PreviewProbeResult> {
  const target = normalizePreviewUrl(url);
  const probedAt = new Date().toISOString();

  return new Promise((resolve) => {
    const req = http.get(
      target,
      { timeout: 8_000, headers: { Accept: "text/html,*/*" } },
      (res) => {
        const contentType = res.headers["content-type"]?.toString() ?? null;
        const status = res.statusCode ?? null;
        res.resume();
        const ok = status !== null && status >= 200 && status < 400;
        resolve({
          ok,
          httpStatus: status,
          contentType,
          errorKind: ok ? "none" : "http_error",
          ...(ok ? {} : { error: `HTTP ${status ?? "error"}` }),
          probedAt,
        });
      },
    );
    req.on("timeout", () => {
      req.destroy();
      resolve({
        ok: false,
        httpStatus: null,
        contentType: null,
        error: "Probe timed out",
        errorKind: "timeout",
        probedAt,
      });
    });
    req.on("error", (err) => {
      const message = String(err);
      resolve({
        ok: false,
        httpStatus: null,
        contentType: null,
        error: message,
        errorKind: classifyProbeError(message),
        probedAt,
      });
    });
  });
}

/** Kill any Studio-managed preview and wait for the process to exit (frees the port). */
export async function stopPreviewAsync(): Promise<void> {
  const proc = previewProc;
  if (!proc) {
    previewUrl = null;
    return;
  }
  previewProc = null;
  previewUrl = null;

  await new Promise<void>((resolve) => {
    const forceKill = setTimeout(() => {
      try {
        proc.kill("SIGKILL");
      } catch {
        /* already dead */
      }
      resolve();
    }, 2_500);

    proc.once("close", () => {
      clearTimeout(forceKill);
      resolve();
    });
    proc.once("error", () => {
      clearTimeout(forceKill);
      resolve();
    });

    try {
      proc.kill("SIGTERM");
    } catch {
      clearTimeout(forceKill);
      resolve();
    }
  });
}

export function stopPreview(): void {
  if (previewProc) {
    try {
      previewProc.kill("SIGTERM");
    } catch {
      /* ignore */
    }
    previewProc = null;
  }
  previewUrl = null;
}

export function getPreviewState(): {
  running: boolean;
  url: string | null;
  root: string | null;
  port: number;
  lastSuccessfulPreviewAt: string | null;
  processExited: boolean;
  lastFailureDiagnostics: PreviewDiagnosticsPayload | null;
} {
  const processAlive =
    previewProc !== null && previewProc.exitCode === null && !previewProc.killed;
  return {
    running: processAlive,
    url: previewUrl,
    root: previewRoot,
    port: previewPortFromUrl(previewUrl),
    lastSuccessfulPreviewAt,
    processExited:
      previewProc !== null &&
      previewProc.exitCode !== null &&
      previewProc.exitCode !== 0,
    lastFailureDiagnostics,
  };
}

export async function startPreview(root: string): Promise<PreviewStartResult> {
  await stopPreviewAsync();
  previewRoot = root;
  lastFailureDiagnostics = null;

  const context = collectPreviewProjectContext(root);

  if (!context.hasPreviewScript) {
    const diagnostics = buildPreviewDiagnostics({
      root,
      port: DEFAULT_PREVIEW_PORT,
      exitCode: null,
      stdout: "",
      stderr: "",
      portInUse: false,
      portHeldByStudio: false,
      triedPorts: [DEFAULT_PREVIEW_PORT],
      context,
      genericError: "Missing preview script in package.json",
    });
    lastFailureDiagnostics = diagnostics;
    return { ok: false, error: diagnostics.rootCause, diagnostics };
  }

  if (!context.distExists) {
    const diagnostics = buildPreviewDiagnostics({
      root,
      port: DEFAULT_PREVIEW_PORT,
      exitCode: null,
      stdout: "",
      stderr: "",
      portInUse: false,
      portHeldByStudio: false,
      triedPorts: [DEFAULT_PREVIEW_PORT],
      context,
      genericError: "dist folder missing",
    });
    lastFailureDiagnostics = diagnostics;
    return { ok: false, error: diagnostics.rootCause, diagnostics };
  }

  const picked = await pickPreviewPort(DEFAULT_PREVIEW_PORT);
  if (picked.port === null) {
    const diagnostics = buildPreviewDiagnostics({
      root,
      port: DEFAULT_PREVIEW_PORT,
      exitCode: null,
      stdout: "",
      stderr: "",
      portInUse: true,
      portHeldByStudio: false,
      triedPorts: picked.tried,
      context,
      allPortsInUse: true,
    });
    lastFailureDiagnostics = diagnostics;
    return { ok: false, error: diagnostics.rootCause, diagnostics };
  }

  const port = picked.port;
  previewPort = port;
  const command = previewCommand(port);
  const portInUseBeforeStart = await isPortInUse(port);

  return new Promise((resolve) => {
    let stdoutBuf = "";
    let stderrBuf = "";
    let settled = false;

    const env = {
      ...process.env,
      PATH: `${process.env.PATH ?? ""}:/usr/local/bin:/opt/homebrew/bin`,
      CI: "1",
      FORCE_COLOR: "0",
      NO_COLOR: "1",
    };

    const child = spawn(command, {
      cwd: root,
      shell: true,
      env,
      windowsHide: true,
    });
    previewProc = child;

    const fail = (genericError: string, exitCode: number | null = null) => {
      if (settled) return;
      settled = true;
      const diagnostics = buildPreviewDiagnostics({
        root,
        port,
        exitCode,
        stdout: stdoutBuf,
        stderr: stderrBuf,
        portInUse:
          portInUseBeforeStart ||
          /EADDRINUSE|already in use/i.test(`${stdoutBuf}\n${stderrBuf}`),
        portHeldByStudio: true,
        triedPorts: picked.tried,
        context,
        genericError,
      });
      lastFailureDiagnostics = diagnostics;
      void stopPreviewAsync();
      resolve({ ok: false, error: diagnostics.rootCause, diagnostics });
    };

    let startTimer: ReturnType<typeof setTimeout> | undefined;
    let pollTimer: ReturnType<typeof setInterval> | undefined;
    let readyCheckInFlight = false;

    const clearReadyTimers = () => {
      if (startTimer !== undefined) {
        clearTimeout(startTimer);
        startTimer = undefined;
      }
      if (pollTimer !== undefined) {
        clearInterval(pollTimer);
        pollTimer = undefined;
      }
    };

    const scanOutput = (): string | null =>
      extractPreviewUrl(`${stdoutBuf}\n${stderrBuf}`);

    const tryReady = async (): Promise<void> => {
      if (settled || readyCheckInFlight) return;
      readyCheckInFlight = true;
      try {
        const fromLog = scanOutput();
        if (fromLog) {
          done(true, fromLog);
          return;
        }
        const probe = await probePreviewUrl(previewUrlForPort(port));
        if (!settled && probe.ok) {
          done(true, previewUrlForPort(port));
        }
      } finally {
        readyCheckInFlight = false;
      }
    };

    const done = (ok: boolean, url?: string) => {
      clearReadyTimers();
      if (settled) return;
      settled = true;
      if (ok) {
        previewUrl = url ?? `http://127.0.0.1:${port}/`;
        lastSuccessfulPreviewAt = new Date().toISOString();
        lastFailureDiagnostics = null;
        resolve({ ok: true, url: previewUrl });
      } else {
        fail("Preview failed to start");
      }
    };

    child.stdout?.on("data", (d: Buffer) => {
      stdoutBuf += d.toString();
      void tryReady();
    });
    child.stderr?.on("data", (d: Buffer) => {
      stderrBuf += d.toString();
      void tryReady();
    });
    child.on("error", (err) => fail(String(err), null));
    child.on("close", (code) => {
      if (settled) {
        previewProc = null;
        return;
      }
      if (code === 0) {
        done(true, scanOutput() ?? previewUrlForPort(port));
        return;
      }
      fail(`Preview exited (code ${code ?? "?"}).`, code);
    });

    pollTimer = setInterval(() => {
      void tryReady();
    }, POLL_INTERVAL_MS);

    startTimer = setTimeout(() => {
      void (async () => {
        if (settled) return;
        const fromLog = scanOutput();
        if (fromLog) {
          done(true, fromLog);
          return;
        }
        const probe = await probePreviewUrl(previewUrlForPort(port));
        if (!settled && probe.ok) {
          done(true, previewUrlForPort(port));
          return;
        }
        if (!settled) {
          fail("Preview timed out waiting for server URL");
        }
      })();
    }, START_WAIT_MS);
  });
}
