import {
  collectVerificationFailures,
  formatFailureLine,
  pickPrimaryFailure,
} from "@/core/autoFix/failureDetection";
import type { FailureDiagnostic } from "@/core/autoFix/types";
import type { GreenfieldSetupResult } from "@/core/greenfield/types";
import { GREENFIELD_FILE_PATHS } from "@/core/greenfield/types";
import { formatTypeScriptRootCauseFromDetails } from "@/core/diagnostics/failureReport";
import {
  resolveTypecheckDetails,
  type TypeScriptCheckDetails,
} from "@/core/greenfield/tscDiagnostics";
import { setupHasQuickRepairableErrors } from "@/core/greenfield/quickRepair";
import type { CommandResult, VerificationResult } from "@/types";

/** App source files repair may touch by default. */
export const GREENFIELD_REPAIR_PRIMARY_PATHS = [
  "src/App.tsx",
  "src/index.css",
  "src/main.tsx",
] as const;

/** Tooling files — only when diagnostics clearly reference them. */
export const GREENFIELD_REPAIR_CONFIG_PATHS = [
  "package.json",
  "tsconfig.json",
  "vite.config.ts",
  "index.html",
] as const;

export const GREENFIELD_AI_REPAIR_ATTEMPTS = 3;
export const GREENFIELD_ESCALATION_REPAIR_ATTEMPTS = 1;
export const DEFAULT_GREENFIELD_REPAIR_ATTEMPTS = GREENFIELD_AI_REPAIR_ATTEMPTS;

export type GreenfieldRepairFailureKind = "typescript" | "build";

export interface GreenfieldRepairAttempt {
  readonly attempt: number;
  readonly targetPath: string;
  readonly outcome: "applied" | "failed" | "skipped";
  readonly detail: string;
}

export interface GreenfieldRepairSnapshot {
  readonly status: "repair_needed" | "repairing" | "awaiting_approval" | "repaired" | "failed";
  readonly failureKind: GreenfieldRepairFailureKind;
  readonly primaryErrorLine: string;
  readonly repairPrompt: string;
  readonly attempts: readonly GreenfieldRepairAttempt[];
  readonly filesRepaired: readonly string[];
  readonly pendingRelPath: string | null;
  readonly pendingSummary: string | null;
}

const CONFIG_PATH_RE = new RegExp(
  `\\b(${GREENFIELD_REPAIR_CONFIG_PATHS.map((p) => p.replace(/\./g, "\\.")).join("|")})\\b`,
  "i",
);

export function diagnosticTargetsConfigFile(
  diagnostic: FailureDiagnostic | { readonly file: string; readonly message: string },
): boolean {
  const hay = `${diagnostic.file} ${diagnostic.message}`;
  return CONFIG_PATH_RE.test(hay);
}

export function isAllowedGreenfieldRepairPath(
  relPath: string,
  primaryDiagnostic: FailureDiagnostic | null,
): boolean {
  const norm = relPath.replace(/\\/g, "/");
  if ((GREENFIELD_REPAIR_PRIMARY_PATHS as readonly string[]).includes(norm)) {
    return true;
  }
  if (primaryDiagnostic?.file) {
    const primaryNorm = primaryDiagnostic.file.replace(/\\/g, "/").replace(/^\.\//, "");
    if (norm === primaryNorm) return true;
  }
  if (
    (GREENFIELD_REPAIR_CONFIG_PATHS as readonly string[]).includes(norm) &&
    primaryDiagnostic &&
    diagnosticTargetsConfigFile(primaryDiagnostic)
  ) {
    return true;
  }
  return false;
}

export function resolveGreenfieldRepairMaxOutputTokens(
  settings: Pick<import("@/core/providers/types").ProviderSettings, "geminiModel" | "anthropicModel" | "provider">,
): number {
  const model =
    settings.provider === "gemini"
      ? (settings.geminiModel ?? "")
      : (settings.anthropicModel ?? "");
  if (/2\.5-pro|thinking/i.test(model)) return 16384;
  return 8192;
}

export function greenfieldRepairAllowedPaths(
  primaryDiagnostic: FailureDiagnostic | null,
): readonly string[] {
  const paths: string[] = [...GREENFIELD_REPAIR_PRIMARY_PATHS];
  if (primaryDiagnostic?.file) {
    const norm = primaryDiagnostic.file.replace(/\\/g, "/").replace(/^\.\//, "");
    if (!paths.includes(norm)) paths.push(norm);
  }
  if (primaryDiagnostic && diagnosticTargetsConfigFile(primaryDiagnostic)) {
    for (const p of GREENFIELD_REPAIR_CONFIG_PATHS) {
      if (!paths.includes(p)) paths.push(p);
    }
  }
  return paths;
}

/** Map setup output to verification shape for failure detection. */
export function greenfieldSetupToVerification(
  setup: GreenfieldSetupResult,
): VerificationResult {
  const skippedBuild: CommandResult = {
    command: "npm run build",
    ok: true,
    exitCode: 0,
    stdout: "",
    stderr: "",
    durationMs: 0,
    errorCount: 0,
    warningCount: 0,
    timedOut: false,
    truncated: false,
  };
  const typecheck =
    setup.typecheck ??
    ({
      command: "npx tsc --noEmit",
      ok: false,
      exitCode: 2,
      stdout: "",
      stderr: setup.error ?? "",
      durationMs: 0,
      errorCount: 1,
      warningCount: 0,
      timedOut: false,
      truncated: false,
    } satisfies CommandResult);
  const build =
    setup.build ??
    (typecheck.ok ? skippedBuild : { ...skippedBuild, ok: false, exitCode: null });

  return {
    typecheck,
    build,
    ranAt: Date.now(),
  };
}

export function greenfieldRepairFailureKind(
  setup: GreenfieldSetupResult,
): GreenfieldRepairFailureKind {
  if (setup.typecheck && !setup.typecheck.ok) return "typescript";
  return "build";
}

export function greenfieldRepairAskHeadline(setup: GreenfieldSetupResult): string {
  const details = resolveTypecheckDetails(setup);
  if (
    details?.diagnostics.some((d) => d.code === "TS6133" && d.category === "error")
  ) {
    return "Generated app has small TypeScript cleanup errors. Repair now?";
  }
  if (details && setupHasQuickRepairableErrors(details.diagnostics)) {
    return "Generated app has fixable TypeScript errors. Repair now?";
  }
  return "Generated app needs repair. Repair now?";
}

export function pickGreenfieldRepairTarget(
  setup: GreenfieldSetupResult,
  modifiedFiles: readonly string[],
  projectRoot?: string,
): string | null {
  const typecheckDetails = resolveTypecheckDetails(setup);
  const primaryTypecheckError = typecheckDetails?.diagnostics.find(
    (d) => d.category === "error",
  );
  if (primaryTypecheckError?.file) {
    const norm = primaryTypecheckError.file.replace(/\\/g, "/").replace(/^\.\//, "");
    if (modifiedFiles.includes(norm)) return norm;
  }

  const verification = greenfieldSetupToVerification(setup);
  const diagnostics = collectVerificationFailures(verification, projectRoot);
  const primary = pickPrimaryFailure(diagnostics);
  const allowed = new Set(greenfieldRepairAllowedPaths(primary));

  if (primary?.file) {
    const norm = primary.file.replace(/\\/g, "/").replace(/^\.\//, "");
    if (modifiedFiles.includes(norm) && isAllowedGreenfieldRepairPath(norm, primary)) {
      return norm;
    }
    const candidates = [
      norm,
      norm.includes("/") ? norm : `src/${norm}`,
      ...modifiedFiles,
    ];
    for (const c of candidates) {
      if (allowed.has(c)) return c;
      const base = c.split("/").pop() ?? c;
      const match = modifiedFiles.find(
        (p) => p === c || p.endsWith(`/${base}`) || p.split("/").pop() === base,
      );
      if (match && allowed.has(match)) return match;
    }
  }

  for (const p of GREENFIELD_REPAIR_PRIMARY_PATHS) {
    if (modifiedFiles.includes(p)) return p;
  }
  return modifiedFiles.find((p) => allowed.has(p)) ?? null;
}

export function buildGreenfieldRepairPromptText(opts: {
  readonly userPrompt: string;
  readonly generatedFiles: readonly string[];
  readonly setup: GreenfieldSetupResult;
  readonly targetPath: string;
  readonly targetContent: string;
  readonly attempt: number;
  readonly maxAttempts: number;
}): string {
  const details = resolveTypecheckDetails(opts.setup);
  const verification = greenfieldSetupToVerification(opts.setup);
  const diagnostics = collectVerificationFailures(verification);
  const primary = pickPrimaryFailure(diagnostics);
  const errorLines =
    details?.diagnostics
      .filter((d) => d.category === "error")
      .map((d) => `${d.file}:${d.line}:${d.column} ${d.code} — ${d.message}`) ??
    diagnostics.map((d) => formatFailureLine(d));

  const hint =
    primary?.code === "TS2322" && primary.message.includes("undefined") &&
    primary.message.includes("null")
      ? " Array.find returns undefined; coerce with `?? null` when the prop type is T | null."
      : primary?.code === "TS2345" &&
          /\|\s*null/.test(primary.message) &&
          /parameter of type/.test(primary.message)
        ? " Add a null guard before the call or narrow the nullable value before passing it."
        : "";

  return [
    "Fix TypeScript/build compile errors in a generated New App project.",
    "Do NOT redesign the app, add features, or change unrelated code.",
    "Return ONLY the repaired file using @@FILE markers.",
    "",
    `Attempt ${opts.attempt} of ${opts.maxAttempts}`,
    "",
    "TypeScript / build errors:",
    ...errorLines.map((l) => `- ${l}`),
    hint ? `Hint:${hint}` : "",
    "",
    "Generated files:",
    opts.generatedFiles.join(", "),
    "",
    "Original user request:",
    opts.userPrompt,
    "",
    `Target file: ${opts.targetPath}`,
    "",
    "Required response format:",
    `@@FILE:${opts.targetPath}@@`,
    "<complete updated file>",
    `@@END:${opts.targetPath}@@`,
    "",
    "Current file content:",
    "--- BEGIN ---",
    opts.targetContent,
    "--- END ---",
  ]
    .filter(Boolean)
    .join("\n");
}

export function primaryErrorLineFromSetup(setup: GreenfieldSetupResult): string {
  const details = resolveTypecheckDetails(setup);
  if (details) {
    const line = formatTypeScriptRootCauseFromDetails(details);
    if (line) return line;
  }
  if (setup.build && !setup.build.ok) {
    const first = `${setup.build.stderr}\n${setup.build.stdout}`
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find(Boolean);
    return first ? `Build failed — ${first}` : "Build failed.";
  }
  return setup.error ?? "Setup failed.";
}

export function createGreenfieldRepairSnapshot(opts: {
  setup: GreenfieldSetupResult;
  userPrompt: string;
  generatedFiles: readonly string[];
  targetPath: string;
  targetContent: string;
  maxAttempts: number;
}): GreenfieldRepairSnapshot {
  const primaryErrorLine = primaryErrorLineFromSetup(opts.setup);
  return {
    status: "repair_needed",
    failureKind: greenfieldRepairFailureKind(opts.setup),
    primaryErrorLine,
    repairPrompt: buildGreenfieldRepairPromptText({
      userPrompt: opts.userPrompt,
      generatedFiles: opts.generatedFiles,
      setup: opts.setup,
      targetPath: opts.targetPath,
      targetContent: opts.targetContent,
      attempt: 1,
      maxAttempts: opts.maxAttempts,
    }),
    attempts: [],
    filesRepaired: [],
    pendingRelPath: null,
    pendingSummary: null,
  };
}

export function mergeSetupAfterTypecheck(
  previous: GreenfieldSetupResult,
  typecheck: CommandResult,
  typecheckDetails?: TypeScriptCheckDetails,
): GreenfieldSetupResult {
  if (!typecheck.ok) {
    const n =
      typecheckDetails?.diagnostics.filter((d) => d.category === "error").length ?? 0;
    const failed: GreenfieldSetupResult = {
      ok: false,
      install: previous.install,
      typecheck,
      error:
        n > 0
          ? `TypeScript check failed (${n} error${n === 1 ? "" : "s"}).`
          : "TypeScript check failed.",
    };
    return typecheckDetails ? { ...failed, typecheckDetails } : failed;
  }
  const passed: GreenfieldSetupResult = {
    ok: false,
    install: previous.install,
    typecheck,
  };
  return typecheckDetails ? { ...passed, typecheckDetails } : passed;
}

export function mergeSetupAfterBuild(
  previous: GreenfieldSetupResult,
  build: CommandResult,
): GreenfieldSetupResult {
  const shared = {
    install: previous.install,
    ...(previous.typecheck ? { typecheck: previous.typecheck } : {}),
    ...(previous.typecheckDetails
      ? { typecheckDetails: previous.typecheckDetails }
      : {}),
    build,
  };
  if (!build.ok) {
    return { ok: false, ...shared, error: "Build failed." };
  }
  return { ok: true, ...shared };
}

export const GREENFIELD_GENERATED_FILE_PATHS = GREENFIELD_FILE_PATHS;
