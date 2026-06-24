import type { CommandResult, VerificationResult } from "@/types";

export interface VerificationProblem {
  readonly source: "typecheck" | "build";
  readonly file: string | null;
  readonly line: number | null;
  readonly column: number | null;
  readonly code: string | null;
  readonly message: string;
}

const TS_ERROR =
  /^(.+?)\((\d+),(\d+)\):\s+error\s+(TS\d+):\s+(.+)$/m;
const GENERIC_ERROR = /error\s+(TS\d+)?:\s*(.+)/i;

function problemsFromStream(
  source: "typecheck" | "build",
  result: CommandResult,
): VerificationProblem[] {
  const text = `${result.stdout}\n${result.stderr}`;
  if (!text.trim() || result.ok) return [];

  const problems: VerificationProblem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(TS_ERROR);
    if (match) {
      problems.push({
        source,
        file: match[1] ?? null,
        line: Number(match[2]),
        column: Number(match[3]),
        code: match[4] ?? null,
        message: match[5] ?? trimmed,
      });
      continue;
    }
    if (/error/i.test(trimmed)) {
      const generic = trimmed.match(GENERIC_ERROR);
      problems.push({
        source,
        file: null,
        line: null,
        column: null,
        code: generic?.[1] ?? null,
        message: generic?.[2] ?? trimmed,
      });
    }
  }

  if (problems.length === 0 && !result.ok) {
    problems.push({
      source,
      file: null,
      line: null,
      column: null,
      code: null,
      message: result.timedOut
        ? `${result.command} timed out`
        : `${result.command} failed (exit ${result.exitCode ?? "?"})`,
    });
  }

  return problems;
}

export function deriveVerificationProblems(
  verification: VerificationResult | null,
): readonly VerificationProblem[] {
  if (!verification) return [];
  return [
    ...problemsFromStream("typecheck", verification.typecheck),
    ...problemsFromStream("build", verification.build),
  ];
}
