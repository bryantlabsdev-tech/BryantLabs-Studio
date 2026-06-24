import { pickFirstRealError } from "@/core/greenfield/failureInvestigation";
import { parseTypeScriptDiagnostics } from "@/core/greenfield/tscDiagnostics";
import type { FailureDiagnostic, FailureKind } from "@/core/autoFix/types";
import type { CommandResult, VerificationResult } from "@/types";

const BUILD_FILE_LINE =
  /(?:^|\s)([\w./\\-]+\.(?:tsx?|jsx?|css)):(\d+):(\d+)/;
const VITE_ERROR = /\[vite\]|vite/i;

function classifyTypeScriptMessage(
  code: string,
  message: string,
): FailureKind {
  if (code === "TS2307" || /cannot find module/i.test(message)) return "import";
  if (code === "TS2304" && /cannot find name/i.test(message)) return "import";
  if (code === "TS6133") return "unused";
  if (/jsx|TS17004|TS2741|TS2607/i.test(message) || /JSX/i.test(message)) {
    return "jsx";
  }
  return "typescript";
}

function normalizeFailurePath(file: string, projectRoot?: string): string {
  let p = file.replace(/\\/g, "/").trim();
  if (projectRoot) {
    const root = projectRoot.replace(/\\/g, "/").replace(/\/$/, "");
    if (p.startsWith(root + "/")) p = p.slice(root.length + 1);
  }
  return p;
}

function parseBuildDiagnostics(cmd: CommandResult): FailureDiagnostic[] {
  const combined = `${cmd.stdout}\n${cmd.stderr}`;
  const lines = combined.split(/\r?\n/);
  const out: FailureDiagnostic[] = [];
  const seen = new Set<string>();

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = trimmed.match(BUILD_FILE_LINE);
    if (m) {
      const key = `${m[1]}:${m[2]}:${m[3]}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        kind: VITE_ERROR.test(trimmed) ? "vite" : "build",
        file: m[1]!,
        line: Number(m[2]),
        column: Number(m[3]),
        message: trimmed,
        raw: trimmed,
      });
      continue;
    }
    if (/error/i.test(trimmed) && out.length < 8) {
      out.push({
        kind: VITE_ERROR.test(trimmed) ? "vite" : "build",
        file: "",
        line: null,
        column: null,
        message: trimmed,
        raw: trimmed,
      });
    }
  }
  return out.slice(0, 12);
}

/** Collect structured failures from a verification run. */
export function collectVerificationFailures(
  verification: VerificationResult,
  projectRoot?: string,
): FailureDiagnostic[] {
  const out: FailureDiagnostic[] = [];

  if (!verification.typecheck.ok) {
    const parsed = parseTypeScriptDiagnostics(
      verification.typecheck.stdout,
      verification.typecheck.stderr,
    );
    const first = pickFirstRealError(parsed);
    for (const d of parsed.filter((x) => x.category === "error")) {
      out.push({
        kind: classifyTypeScriptMessage(d.code, d.message),
        file: normalizeFailurePath(d.file, projectRoot),
        line: d.line,
        column: d.column,
        message: d.message,
        code: d.code,
        raw: d.raw,
      });
    }
    if (first && !out.some((x) => x.raw === first.raw)) {
      out.unshift({
        kind: classifyTypeScriptMessage(first.code, first.message),
        file: normalizeFailurePath(first.file, projectRoot),
        line: first.line,
        column: first.column,
        message: first.message,
        code: first.code,
        raw: first.raw,
      });
    }
  }

  if (!verification.build.ok) {
    out.push(...parseBuildDiagnostics(verification.build));
  }

  return out;
}

export function pickPrimaryFailure(
  diagnostics: readonly FailureDiagnostic[],
): FailureDiagnostic | null {
  if (diagnostics.length === 0) return null;
  const ranked = [...diagnostics].sort((a, b) => {
    const rank = (k: FailureKind) => {
      if (k === "import") return 0;
      if (k === "jsx") return 1;
      if (k === "typescript") return 2;
      if (k === "vite") return 3;
      return 4;
    };
    const d = rank(a.kind) - rank(b.kind);
    if (d !== 0) return d;
    if (a.file && !b.file) return -1;
    if (!a.file && b.file) return 1;
    return 0;
  });
  return ranked[0] ?? null;
}

export function formatFailureLine(d: FailureDiagnostic): string {
  const loc =
    d.line != null
      ? `${d.file}:${d.line}${d.column != null ? `:${d.column}` : ""}`
      : d.file || "project";
  const code = d.code ? ` ${d.code}` : "";
  return `${loc} — ${d.message}${code}`;
}
