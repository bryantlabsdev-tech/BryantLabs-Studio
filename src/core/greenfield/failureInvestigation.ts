import type { GeneratedFile, GreenfieldSetupResult } from "@/core/greenfield/types";
import {
  parseTypeScriptDiagnostics,
  type TypeScriptCheckDetails,
  type TypeScriptDiagnostic,
} from "@/core/greenfield/tscDiagnostics";
import type { CommandResult } from "@/types";

/** Key generated files to inspect when a run fails. */
export const INVESTIGATION_FILE_PATHS = [
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "src/main.tsx",
  "src/App.tsx",
] as const;

export interface CorruptionFinding {
  readonly kind:
    | "plugin-react-in-app"
    | "vite-config-leak"
    | "parse-marker"
    | "duplicate-export"
    | "tsconfig-reference";
  readonly path: string;
  readonly detail: string;
}

export interface FailureInvestigation {
  readonly installOk: boolean;
  readonly typecheckRan: boolean;
  readonly errorFiles: readonly string[];
  readonly firstError: TypeScriptDiagnostic | null;
  readonly corruption: readonly CorruptionFinding[];
  readonly generatedSnippets: ReadonlyArray<{ path: string; content: string }>;
}

export function formatCommandLog(
  label: string,
  cmd: CommandResult,
): string {
  const lines = [
    `${label}`,
    `Command: ${cmd.command}`,
    `Exit code: ${cmd.exitCode ?? "—"}`,
    `Duration: ${cmd.durationMs} ms`,
    `Timed out: ${cmd.timedOut}`,
    `Output truncated: ${cmd.truncated}`,
    "",
    "--- stdout ---",
    cmd.stdout || "(empty)",
    "",
    "--- stderr ---",
    cmd.stderr || "(empty)",
  ];
  return lines.join("\n");
}

export function formatNpmInstallLog(install: CommandResult): string {
  return formatCommandLog("npm install", install);
}

function filesFromDiagnostics(
  details: TypeScriptCheckDetails | undefined,
): string[] {
  if (!details) return [];
  const files = new Set<string>();
  for (const d of details.diagnostics) {
    if (d.category === "error") files.add(d.file);
  }
  return [...files].sort();
}

function filesFromRawTsc(stdout: string, stderr: string): string[] {
  const combined = `${stdout}\n${stderr}`;
  const files = new Set<string>();
  const re = /^(.+?)\(\d+,\d+\):/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(combined)) !== null) {
    files.add(m[1]!.trim());
  }
  return [...files].sort();
}

/** Prefer root-cause diagnostics over cascading type errors. */
export function pickFirstRealError(
  diagnostics: readonly TypeScriptDiagnostic[],
): TypeScriptDiagnostic | null {
  if (diagnostics.length === 0) return null;
  const errors = diagnostics.filter((d) => d.category === "error");
  if (errors.length === 0) return diagnostics[0] ?? null;

  const rank = (code: string): number => {
    if (code === "TS6053") return 0;
    if (code === "TS2307" || code === "TS2304") return 1;
    if (code.startsWith("TS1") || code === "TS1005" || code === "TS1128") return 2;
    if (code === "TS1030") return 2;
    if (code === "TS6133") return 3;
    if (code === "TS2322" || code === "TS7006" || code === "TS2552") return 3;
    return 5;
  };

  const sorted = [...errors].sort((a, b) => {
    const ra = rank(a.code);
    const rb = rank(b.code);
    if (ra !== rb) return ra - rb;
    if (a.file !== b.file) return a.file.localeCompare(b.file);
    return a.line - b.line;
  });
  return sorted[0] ?? null;
}

export function analyzeGenerationCorruption(
  files: readonly GeneratedFile[] | null | undefined,
): CorruptionFinding[] {
  if (!files?.length) return [];
  const findings: CorruptionFinding[] = [];

  for (const file of files) {
    const p = file.path;
    const c = file.content;

    if (p !== "vite.config.ts" && /@vitejs\/plugin-react/.test(c)) {
      findings.push({
        kind: "plugin-react-in-app",
        path: p,
        detail: "@vitejs/plugin-react import found outside vite.config.ts",
      });
    }
    if (
      p !== "vite.config.ts" &&
      /defineConfig\s*\(/.test(c) &&
      /from\s+["']vite["']/.test(c)
    ) {
      findings.push({
        kind: "vite-config-leak",
        path: p,
        detail: "vite defineConfig() pattern found outside vite.config.ts",
      });
    }
    if (/@@FILE\s*:|@@END\s*:/.test(c)) {
      findings.push({
        kind: "parse-marker",
        path: p,
        detail: "Unstripped @@FILE/@@END marker tokens in file body",
      });
    }
    if (/\bexport\s+export\b/.test(c)) {
      findings.push({
        kind: "duplicate-export",
        path: p,
        detail: "Duplicate export keyword (possible merged/boundary artifact)",
      });
    }
    if (p === "tsconfig.json") {
      try {
        const json = JSON.parse(c) as { references?: unknown };
        if (Array.isArray(json.references) && json.references.length > 0) {
          findings.push({
            kind: "tsconfig-reference",
            path: p,
            detail:
              "tsconfig.json references other projects (e.g. tsconfig.node.json) — not in greenfield 7-file set",
          });
        }
      } catch {
        findings.push({
          kind: "tsconfig-reference",
          path: p,
          detail: "tsconfig.json is not valid JSON",
        });
      }
    }
  }

  return findings;
}

export function buildFailureInvestigation(opts: {
  setupResult: GreenfieldSetupResult | null;
  generatedFiles: readonly GeneratedFile[] | null | undefined;
  typecheckDetails?: TypeScriptCheckDetails | undefined;
}): FailureInvestigation | null {
  const { setupResult, generatedFiles } = opts;
  if (!setupResult) return null;

  let details = opts.typecheckDetails;
  if (!details && setupResult.typecheck && !setupResult.typecheck.ok) {
    details = {
      command: setupResult.typecheck.command,
      exitCode: setupResult.typecheck.exitCode,
      stdout: setupResult.typecheck.stdout,
      stderr: setupResult.typecheck.stderr,
      durationMs: setupResult.typecheck.durationMs,
      timedOut: setupResult.typecheck.timedOut,
      truncated: setupResult.typecheck.truncated,
      diagnostics: parseTypeScriptDiagnostics(
        setupResult.typecheck.stdout,
        setupResult.typecheck.stderr,
      ),
    };
  }

  const errorFiles = details
    ? filesFromDiagnostics(details)
    : setupResult.typecheck
      ? filesFromRawTsc(
          setupResult.typecheck.stdout,
          setupResult.typecheck.stderr,
        )
      : [];

  const firstError = details
    ? pickFirstRealError(details.diagnostics)
    : null;

  const byPath = new Map(
    (generatedFiles ?? []).map((f) => [f.path, f.content] as const),
  );
  const generatedSnippets = INVESTIGATION_FILE_PATHS.map((path) => ({
    path,
    content: byPath.get(path) ?? "(not in generated file set)",
  }));

  return {
    installOk: setupResult.install.ok,
    typecheckRan: setupResult.typecheck !== undefined,
    errorFiles,
    firstError,
    corruption: analyzeGenerationCorruption(generatedFiles),
    generatedSnippets,
  };
}

export function formatVerificationReport(opts: {
  setupResult: GreenfieldSetupResult;
  investigation: FailureInvestigation;
  targetFolder?: string | null;
  headline?: string | null;
  typecheckDetails?: TypeScriptCheckDetails;
}): string {
  const { setupResult, investigation, targetFolder, headline, typecheckDetails } =
    opts;
  const sections: string[] = [
    "Greenfield verification report",
    "",
    `Target folder: ${targetFolder ?? "(unknown)"}`,
    `Headline: ${headline ?? setupResult.error ?? "(none)"}`,
    "",
    "=== npm install ===",
    formatNpmInstallLog(setupResult.install),
  ];

  if (investigation.firstError) {
    const e = investigation.firstError;
    sections.push(
      "",
      "=== First real error (root cause candidate) ===",
      `File: ${e.file}`,
      `Line: ${e.line}`,
      `Column: ${e.column}`,
      `Code: ${e.code}`,
      `Message: ${e.message}`,
      `Raw: ${e.raw}`,
    );
  }

  sections.push(
    "",
    `=== Files with errors (${investigation.errorFiles.length}) ===`,
    investigation.errorFiles.length
      ? investigation.errorFiles.map((f) => `  - ${f}`).join("\n")
      : "  (none parsed)",
  );

  if (investigation.corruption.length > 0) {
    sections.push("", "=== Generation corruption checks ===");
    for (const f of investigation.corruption) {
      sections.push(`  [${f.kind}] ${f.path}: ${f.detail}`);
    }
  } else {
    sections.push(
      "",
      "=== Generation corruption checks ===",
      "  No plugin-react leak, vite.config leak, or @@FILE markers in generated files.",
    );
  }

  if (typecheckDetails) {
    sections.push(
      "",
      "=== TypeScript command ===",
      `Command: ${typecheckDetails.command}`,
      `Exit: ${typecheckDetails.exitCode ?? "—"}`,
      "",
      "--- stdout ---",
      typecheckDetails.stdout || "(empty)",
      "",
      "--- stderr ---",
      typecheckDetails.stderr || "(empty)",
      "",
      "=== Parsed diagnostics ===",
    );
    for (const d of typecheckDetails.diagnostics) {
      sections.push(
        `${d.file}:${d.line}:${d.column} ${d.category} ${d.code}: ${d.message}`,
      );
    }
  } else if (setupResult.typecheck) {
    sections.push(
      "",
      "=== TypeScript (raw) ===",
      formatCommandLog("TypeScript", setupResult.typecheck),
    );
  }

  sections.push("", "=== Generated file snapshots ===");
  for (const { path, content } of investigation.generatedSnippets) {
    sections.push("", `--- ${path} ---`, content);
  }

  return sections.join("\n");
}
