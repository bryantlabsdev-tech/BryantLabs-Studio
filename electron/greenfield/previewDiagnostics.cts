import * as fs from "node:fs";
import * as net from "node:net";
import * as path from "node:path";
import {
  buildViteConfigDiagnostics,
  formatViteConfigDiagnosticsText,
  type ViteConfigDiagnosticsPayload,
} from "./viteConfigDiagnostics.cjs";
import { extractPreviewUrl } from "./previewUrlParse.cjs";

export type { ViteConfigDiagnosticsPayload } from "./viteConfigDiagnostics.cjs";
export { formatViteConfigDiagnosticsText } from "./viteConfigDiagnostics.cjs";

export const DEFAULT_PREVIEW_PORT = 4173;
export const PREVIEW_PORT_SCAN_COUNT = 10;

export interface PreviewProjectContext {
  readonly hasPreviewScript: boolean;
  readonly previewScript: string | null;
  readonly distExists: boolean;
  readonly distPath: string;
  readonly packageJsonExists: boolean;
}

export interface PreviewDiagnosticsPayload {
  readonly command: string;
  readonly cwd: string;
  readonly port: number;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly portInUse: boolean;
  readonly portHeldByStudio: boolean;
  readonly distExists: boolean;
  readonly distPath: string;
  readonly hasPreviewScript: boolean;
  readonly previewScript: string | null;
  readonly firstErrorLine: string | null;
  readonly rootCause: string;
  readonly triedPorts: readonly number[];
  readonly viteConfig: ViteConfigDiagnosticsPayload | null;
}

export function collectPreviewProjectContext(root: string): PreviewProjectContext {
  const pkgPath = path.join(root, "package.json");
  let hasPreviewScript = false;
  let previewScript: string | null = null;
  let packageJsonExists = false;

  if (fs.existsSync(pkgPath)) {
    packageJsonExists = true;
    try {
      const raw = fs.readFileSync(pkgPath, "utf8");
      const pkg = JSON.parse(raw) as { scripts?: Record<string, string> };
      previewScript = pkg.scripts?.preview ?? null;
      hasPreviewScript = Boolean(previewScript?.trim());
    } catch {
      hasPreviewScript = false;
    }
  }

  const distPath = path.join(root, "dist");
  const distExists =
    fs.existsSync(distPath) && fs.statSync(distPath).isDirectory();

  return {
    hasPreviewScript,
    previewScript,
    distExists,
    distPath,
    packageJsonExists,
  };
}

export function isPortInUse(port: number, host = "127.0.0.1"): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.unref();
    server.once("error", (err: NodeJS.ErrnoException) => {
      resolve(err.code === "EADDRINUSE");
    });
    server.once("listening", () => {
      server.close(() => resolve(false));
    });
    server.listen(port, host);
  });
}

export async function pickPreviewPort(
  startPort = DEFAULT_PREVIEW_PORT,
  count = PREVIEW_PORT_SCAN_COUNT,
): Promise<{ port: number | null; tried: number[]; allInUse: boolean }> {
  const tried: number[] = [];
  for (let i = 0; i < count; i++) {
    const p = startPort + i;
    tried.push(p);
    if (!(await isPortInUse(p))) {
      return { port: p, tried, allInUse: false };
    }
  }
  return { port: null, tried, allInUse: true };
}

export function previewCommand(port: number): string {
  return `npm run preview -- --host 127.0.0.1 --port ${port}`;
}

export function truncateOutput(text: string, max = 50_000): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max)}\n… (output truncated)`;
}

const VITE_CONFIG_WRAPPER_RE = /failed to load config from/i;

export function findFirstErrorLine(stdout: string, stderr: string): string | null {
  const combined = `${stdout}\n${stderr}`;
  const lines = combined.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  for (const line of lines) {
    if (/EADDRINUSE|already in use/i.test(line)) return line;
  }
  for (const line of lines) {
    if (VITE_CONFIG_WRAPPER_RE.test(line)) continue;
    if (/Cannot find package/i.test(line)) return line;
    if (/Could not resolve/i.test(line)) return line;
    if (/SyntaxError:/i.test(line)) return line;
    if (/ERROR:/i.test(line)) return line;
    if (/^(Error|TypeError|ReferenceError)/i.test(line)) return line;
    if (/error/i.test(line)) return line;
    if (/failed|ERR!/i.test(line)) return line;
    if (/✘|×/.test(line)) return line;
  }
  return lines[0] ?? null;
}

export function inferPreviewRootCause(opts: {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  port: number;
  portInUse: boolean;
  allPortsInUse: boolean;
  context: PreviewProjectContext;
  genericError?: string;
}): string {
  const combined = `${opts.stdout}\n${opts.stderr}`.toLowerCase();

  if (!opts.context.packageJsonExists) {
    return "package.json not found in project root";
  }
  if (!opts.context.hasPreviewScript) {
    return "package.json has no preview script — add a preview script (e.g. vite preview)";
  }
  if (!opts.context.distExists) {
    return "dist folder missing — run npm run build before preview";
  }
  if (opts.allPortsInUse) {
    return `Ports ${opts.port}–${opts.port + PREVIEW_PORT_SCAN_COUNT - 1} already in use`;
  }
  if (
    opts.portInUse ||
    combined.includes("eaddrinuse") ||
    combined.includes("already in use")
  ) {
    return `Port ${opts.port} already in use`;
  }
  if (combined.includes("vite") && combined.includes("not found")) {
    return "Vite preview crashed — vite binary or config missing";
  }
  if (combined.includes("enoent") && combined.includes("dist")) {
    return "dist folder missing — build output not found";
  }
  if (opts.exitCode !== null && opts.exitCode !== 0) {
    const first = findFirstErrorLine(opts.stdout, opts.stderr);
    if (first && !VITE_CONFIG_WRAPPER_RE.test(first)) {
      return `npm preview script failed — ${first}`;
    }
    if (first) return first;
    return `npm preview script failed (exit ${opts.exitCode})`;
  }
  if (opts.genericError?.includes("timed out waiting for server URL")) {
    const parsed = extractPreviewUrl(`${opts.stdout}\n${opts.stderr}`);
    if (parsed) {
      return `Preview server is running at ${parsed} — URL was in output (retry preview if the panel did not load)`;
    }
    if (/Local:\s*/i.test(opts.stdout) || /Local:\s*/i.test(opts.stderr)) {
      return "Vite printed a Local preview URL but Studio could not parse it — see stdout in preview diagnostics";
    }
  }
  if (opts.genericError) return opts.genericError;
  return "Vite preview failed to start";
}

export function buildPreviewDiagnostics(opts: {
  root: string;
  port: number;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  portInUse: boolean;
  portHeldByStudio: boolean;
  triedPorts: number[];
  context: PreviewProjectContext;
  genericError?: string;
  allPortsInUse?: boolean;
}): PreviewDiagnosticsPayload {
  const viteConfig = buildViteConfigDiagnostics({
    stdout: opts.stdout,
    stderr: opts.stderr,
    cwd: opts.root,
  });
  const stdout = truncateOutput(opts.stdout);
  const stderr = truncateOutput(opts.stderr);
  const firstErrorLine =
    viteConfig?.firstException ?? findFirstErrorLine(stdout, stderr);
  const rootCause = viteConfig
    ? viteConfig.rootCauseLine
    : inferPreviewRootCause({
        stdout,
        stderr,
        exitCode: opts.exitCode,
        port: opts.port,
        portInUse: opts.portInUse,
        allPortsInUse: opts.allPortsInUse ?? false,
        context: opts.context,
        genericError: opts.genericError,
      });

  return {
    command: previewCommand(opts.port),
    cwd: opts.root,
    port: opts.port,
    exitCode: opts.exitCode,
    stdout,
    stderr,
    portInUse: opts.portInUse,
    portHeldByStudio: opts.portHeldByStudio,
    distExists: opts.context.distExists,
    distPath: opts.context.distPath,
    hasPreviewScript: opts.context.hasPreviewScript,
    previewScript: opts.context.previewScript,
    firstErrorLine,
    rootCause,
    triedPorts: opts.triedPorts,
    viteConfig,
  };
}

export function formatPreviewDiagnosticsText(d: PreviewDiagnosticsPayload): string {
  return [
    "Preview diagnostics",
    "==================",
    "",
    `Root cause: ${d.rootCause}`,
    "",
    `Command: ${d.command}`,
    `Working directory: ${d.cwd}`,
    `Port: ${d.port}`,
    `Exit code: ${d.exitCode ?? "—"}`,
    `Port in use: ${d.portInUse ? "yes" : "no"}`,
    `Held by Studio preview: ${d.portHeldByStudio ? "yes" : "no"}`,
    `Tried ports: ${d.triedPorts.join(", ") || "—"}`,
    `dist exists: ${d.distExists ? "yes" : "no"} (${d.distPath})`,
    `preview script: ${d.hasPreviewScript ? d.previewScript ?? "(empty)" : "missing"}`,
    "",
    `First error line: ${d.firstErrorLine ?? "(none parsed)"}`,
    "",
    ...(d.viteConfig ? ["", formatViteConfigDiagnosticsText(d.viteConfig), ""] : []),
    "--- stdout ---",
    d.stdout || "(empty)",
    "",
    "--- stderr ---",
    d.stderr || "(empty)",
  ].join("\n");
}
