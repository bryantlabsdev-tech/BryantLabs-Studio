import type { PreviewFailureInfo } from "@/core/diagnostics/failureReport";
import {
  buildPreviewOnlyFailureReport,
  type StudioFailureReport,
} from "@/core/diagnostics/failureReport";
import type {
  PreviewDiagnostics,
  ViteConfigDiagnostics,
} from "@/core/greenfield/types";

export type { PreviewDiagnostics, ViteConfigDiagnostics };

export function formatViteConfigDiagnosticsCopy(d: ViteConfigDiagnostics): string {
  return [
    "Vite config diagnostics",
    "=====================",
    "",
    `Root cause: ${d.rootCauseLine}`,
    "",
    `Config file: ${d.configFilePath ?? "—"}`,
    `Relative: ${d.configFileRelative ?? "—"}`,
    "",
    "Imports discovered:",
    d.importsDiscovered.length
      ? d.importsDiscovered.map((i) => `  - ${i}`).join("\n")
      : "  (none)",
    "",
    "Missing imports:",
    d.missingImports.length
      ? d.missingImports.map((i) => `  - ${i}`).join("\n")
      : "  (none detected on disk)",
    "",
    `Syntax check: ${d.syntaxParseResult}`,
    "",
    `First exception: ${d.firstException ?? "(none parsed)"}`,
    d.exceptionName ? `Exception type: ${d.exceptionName}` : null,
    "",
    d.stackTrace ? "--- stack trace ---" : null,
    d.stackTrace ?? null,
    "",
    "--- full Vite stdout/stderr ---",
    d.fullOutput || "(empty)",
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function formatPreviewDiagnosticsCopy(d: PreviewDiagnostics): string {
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
    ...(d.viteConfig ? ["", formatViteConfigDiagnosticsCopy(d.viteConfig), ""] : []),
    "--- stdout ---",
    d.stdout || "(empty)",
    "",
    "--- stderr ---",
    d.stderr || "(empty)",
  ].join("\n");
}

export function previewDiagnosticsToFailureInfo(
  d: PreviewDiagnostics,
  opts?: { skippedBecauseBuildFailed?: boolean },
): PreviewFailureInfo {
  return {
    command: d.command,
    exitCode: d.exitCode,
    port: d.port,
    stdout: d.stdout,
    stderr: d.stderr,
    errorMessage: d.rootCause,
    skippedBecauseBuildFailed: opts?.skippedBecauseBuildFailed ?? false,
    crashed: d.exitCode !== null && d.exitCode !== 0,
    cwd: d.cwd,
    portInUse: d.portInUse,
    distExists: d.distExists,
    hasPreviewScript: d.hasPreviewScript,
    previewScript: d.previewScript,
    firstErrorLine: d.firstErrorLine,
    triedPorts: d.triedPorts,
  };
}

export function buildPreviewFailureReport(
  d: PreviewDiagnostics,
  opts?: { skippedBecauseBuildFailed?: boolean },
): StudioFailureReport {
  return buildPreviewOnlyFailureReport(
    previewDiagnosticsToFailureInfo(d, opts),
  );
}
