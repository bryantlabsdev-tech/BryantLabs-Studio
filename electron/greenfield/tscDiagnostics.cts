import type { CommandResult } from "./setup.cjs";

export interface TypeScriptDiagnostic {
  file: string;
  line: number;
  column: number;
  code: string;
  message: string;
  category: "error" | "warning";
  raw: string;
}

export interface TypeScriptCheckDetails {
  command: string;
  exitCode: number | null;
  stdout: string;
  stderr: string;
  durationMs: number;
  timedOut: boolean;
  truncated: boolean;
  diagnostics: TypeScriptDiagnostic[];
}

const LINE_PATTERNS: RegExp[] = [
  // file.ts(12,34): error TS2322: Message
  /^(.+?)\((\d+),(\d+)\):\s+(error|warning)\s+(TS\d+):\s*(.+)$/,
  // file.ts:12:34 - error TS2322: Message
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

export function buildTypeScriptCheckDetails(
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
