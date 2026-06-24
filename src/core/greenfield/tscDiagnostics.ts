/** TypeScript check diagnostics from greenfield setup (mirrors main process). */

import type { CommandResult } from "@/types";
import type { GreenfieldSetupResult } from "@/core/greenfield/types";

export interface TypeScriptDiagnostic {
  readonly file: string;
  readonly line: number;
  readonly column: number;
  readonly code: string;
  readonly message: string;
  readonly category: "error" | "warning";
  readonly raw: string;
}

export interface TypeScriptCheckDetails {
  readonly command: string;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly truncated: boolean;
  readonly diagnostics: readonly TypeScriptDiagnostic[];
}

const LINE_PATTERNS: RegExp[] = [
  /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s*(.+)$/,
  /^(.+?):(\d+):(\d+)\s+-\s+(error|warning)\s+(TS\d+):\s*(.+)$/,
];

export function parseTypeScriptDiagnostics(
  stdout: string,
  stderr: string,
): TypeScriptDiagnostic[] {
  const combined = `${stdout}\n${stderr}`;
  const lines = combined.split(/\r?\n/);
  const found: TypeScriptDiagnostic[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const pattern of LINE_PATTERNS) {
      const m = trimmed.match(pattern);
      if (!m) continue;
      found.push({
        file: m[1]!.trim(),
        line: Number(m[2]),
        column: Number(m[3]),
        category: m[4] as "error" | "warning",
        code: m[5]!,
        message: m[6]!.trim(),
        raw: trimmed,
      });
      break;
    }
  }

  return found;
}

export function buildTypeScriptCheckDetailsFromCommand(
  result: CommandResult,
): TypeScriptCheckDetails {
  return {
    command: result.command,
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    durationMs: result.durationMs,
    timedOut: result.timedOut,
    truncated: result.truncated,
    diagnostics: parseTypeScriptDiagnostics(result.stdout, result.stderr),
  };
}

/** Prefer main-process details; fall back to parsing typecheck output in the renderer. */
export function resolveTypecheckDetails(
  result: GreenfieldSetupResult,
): TypeScriptCheckDetails | undefined {
  if (result.typecheckDetails) return result.typecheckDetails;
  const tc = result.typecheck;
  if (!tc || tc.ok) return undefined;
  return buildTypeScriptCheckDetailsFromCommand(tc);
}

export function formatTypeScriptDiagnosticsCopy(
  details: TypeScriptCheckDetails,
): string {
  const sections: string[] = [
    "Greenfield TypeScript diagnostics",
    "",
    `Command: ${details.command}`,
    `Exit code: ${details.exitCode ?? "null"}`,
    `Duration: ${details.durationMs} ms`,
    `Timed out: ${details.timedOut}`,
    `Output truncated: ${details.truncated}`,
    "",
    "--- stdout ---",
    details.stdout || "(empty)",
    "",
    "--- stderr ---",
    details.stderr || "(empty)",
    "",
  ];

  if (details.diagnostics.length > 0) {
    sections.push("--- parsed diagnostics ---");
    for (const d of details.diagnostics) {
      sections.push(
        `${d.file}:${d.line}:${d.column} ${d.category} ${d.code}: ${d.message}`,
      );
      sections.push(`  raw: ${d.raw}`);
    }
  } else {
    sections.push("--- parsed diagnostics ---", "(none — check raw stdout/stderr)");
  }

  return sections.join("\n");
}

/** Human-readable block for Summary tab / copy (one diagnostic). */
export function formatDiagnosticFields(d: TypeScriptDiagnostic): string {
  return [
    `File: ${d.file}`,
    `Line: ${d.line}`,
    `Column: ${d.column}`,
    `Code: ${d.code}`,
    `Message: ${d.message}`,
  ].join("\n");
}

/** Full TypeScript section for Summary tab and Copy summary. */
export function formatTypeScriptDiagnosticsSummarySection(
  details: TypeScriptCheckDetails,
): string {
  const errors = details.diagnostics.filter((d) => d.category === "error");
  const warnings = details.diagnostics.filter((d) => d.category === "warning");
  const lines: string[] = [
    "TypeScript Diagnostics",
    "--------------------------------",
    `Command: ${details.command}`,
    `Exit code: ${details.exitCode ?? "—"}`,
    `Errors: ${errors.length}, Warnings: ${warnings.length}`,
    "",
  ];

  if (errors.length > 0) {
    lines.push("First error (primary):", formatDiagnosticFields(errors[0]!), "");
    if (errors.length > 1) {
      lines.push(`Additional errors (${errors.length - 1}):`, "");
      for (let i = 1; i < errors.length; i++) {
        lines.push(formatDiagnosticFields(errors[i]!), "");
      }
    }
  } else if (details.diagnostics.length > 0) {
    lines.push("Diagnostics:", "");
    for (const d of details.diagnostics) {
      lines.push(formatDiagnosticFields(d), "");
    }
  } else {
    lines.push("(No line diagnostics parsed — see stdout/stderr below)", "");
  }

  lines.push(
    "stdout:",
    details.stdout || "(empty)",
    "",
    "stderr:",
    details.stderr || "(empty)",
  );
  return lines.join("\n");
}
