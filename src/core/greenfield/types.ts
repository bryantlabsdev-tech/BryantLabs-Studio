import type { ProviderId } from "@/core/providers/types";
import type { CommandResult } from "@/types";
import type { GreenfieldDebugReport } from "@/core/greenfield/debug";
import type { GreenfieldGenerationMetrics } from "@/core/greenfield/metrics";
import type { GreenfieldMarkerAudit } from "@/core/greenfield/promptAudit";
import type { TypeScriptCheckDetails } from "@/core/greenfield/tscDiagnostics";
import type { WriteFileLogEntry } from "@/core/greenfield/writeLog";

/**
 * Greenfield app generation (Phase 10) — single-app MVP from an empty folder.
 * Exactly seven files; no component/lib folders; optional auto-repair after setup.
 */

export const GREENFIELD_FILE_PATHS = [
  "package.json",
  "index.html",
  "src/main.tsx",
  "tsconfig.json",
  "vite.config.ts",
  "src/index.css",
  "src/App.tsx",
] as const;

export type GreenfieldFilePath = (typeof GREENFIELD_FILE_PATHS)[number];

/** Extended project paths under src/ for multi-phase greenfield. */
export type GreenfieldProjectFilePath =
  | GreenfieldFilePath
  | `src/${string}.tsx`
  | `src/${string}.ts`
  | `src/${string}.css`
  | "tailwind.config.js"
  | "postcss.config.js";

export interface GeneratedFile {
  readonly path: GreenfieldFilePath;
  readonly content: string;
}

export interface GreenfieldProjectFile {
  readonly path: GreenfieldProjectFilePath;
  readonly content: string;
}

export type GreenfieldGenerationMode = "lite" | "multi-phase";

export interface GreenfieldParseDiagnostics {
  readonly expectedFiles: readonly GreenfieldFilePath[];
  readonly parsedFiles: readonly GreenfieldFilePath[];
  readonly missingFiles: readonly GreenfieldFilePath[];
  readonly malformedBlocks: readonly GreenfieldFilePath[];
  readonly unexpectedFiles?: readonly string[];
}

export interface GreenfieldParseTrace {
  readonly rawResponsePreview: string;
  readonly rawResponseLength: number;
  readonly parserPatternsAttempted: readonly string[];
  readonly parserFailureReasons: Readonly<Record<string, string>>;
  readonly responseShape?: string;
  readonly bestPattern?: string | null;
  readonly repairAttempted?: boolean;
  readonly repairSucceeded?: boolean;
  readonly fallbackSkeletonCreated?: boolean;
  readonly backupProviderAttempted?: boolean;
  readonly backupProviderUsed?: string | null;
  readonly backupProviderFailureReason?: string | null;
  readonly provider?: string;
  readonly model?: string;
  readonly stage?: string;
}

export interface GreenfieldGenerateResult {
  readonly ok: boolean;
  readonly provider: ProviderId;
  readonly model: string;
  readonly files?: GeneratedFile[];
  /** Full project file set for multi-phase generation (includes src/pages, components, etc.). */
  readonly projectFiles?: readonly GreenfieldProjectFile[];
  readonly generationMode?: GreenfieldGenerationMode;
  readonly manifestPages?: readonly string[];
  readonly rawText?: string;
  readonly error?: string;
  readonly latencyMs: number;
  /** Structured diagnostics when generation fails (no secrets). */
  readonly debug?: GreenfieldDebugReport;
  /** Timing/size instrumentation (success or failure). */
  readonly metrics?: GreenfieldGenerationMetrics;
  /** Marker audit when the response is incomplete (diagnosis only). */
  readonly markerAudit?: GreenfieldMarkerAudit;
  readonly parseDiagnostics?: GreenfieldParseDiagnostics;
  readonly warnings?: readonly string[];
  readonly partialSuccess?: boolean;
  readonly providerRequestSent?: boolean;
  readonly exactFailureStage?: string;
  readonly exactProviderError?: string;
  readonly repairAttempted?: boolean;
  readonly fallbackSkeletonUsed?: boolean;
  readonly skeletonFallbackPaths?: readonly GreenfieldFilePath[];
  readonly appShellIncomplete?: boolean;
  /** Page paths filled with deterministic stubs when the pages phase returned incomplete output. */
  readonly stubbedPagePaths?: readonly string[];
  readonly recoveredPartialPaths?: readonly GreenfieldFilePath[];
  readonly parseTrace?: GreenfieldParseTrace;
}

/** Files to show in review UI / run summary (multi-phase returns full project set). */
export function greenfieldReviewFiles(
  res: Pick<GreenfieldGenerateResult, "generationMode" | "files" | "projectFiles">,
): GeneratedFile[] | null {
  if (res.generationMode === "multi-phase" && res.projectFiles?.length) {
    return res.projectFiles as GeneratedFile[];
  }
  return res.files ?? null;
}

export function greenfieldReviewFilePathList(
  res: Pick<GreenfieldGenerateResult, "generationMode" | "files" | "projectFiles">,
): readonly string[] {
  if (res.generationMode === "multi-phase" && res.projectFiles?.length) {
    return res.projectFiles.map((f) => f.path);
  }
  return res.files?.map((f) => f.path) ?? [...GREENFIELD_FILE_PATHS];
}

export interface GreenfieldWriteResult {
  readonly ok: boolean;
  readonly written: string[];
  readonly errors: string[];
  readonly logs?: readonly WriteFileLogEntry[];
}

export interface GreenfieldSetupResult {
  readonly ok: boolean;
  readonly install: CommandResult;
  readonly typecheck?: CommandResult;
  readonly typecheckDetails?: TypeScriptCheckDetails;
  readonly build?: CommandResult;
  readonly error?: string;
  readonly dependencyRepairs?: readonly string[];
  readonly installRetried?: boolean;
}

export type PreviewProbeErrorKind =
  | "none"
  | "econnrefused"
  | "timeout"
  | "unreachable"
  | "http_error"
  | "unknown";

export interface GreenfieldPreviewProbeResult {
  readonly ok: boolean;
  readonly httpStatus: number | null;
  readonly contentType: string | null;
  readonly error?: string;
  readonly errorKind: PreviewProbeErrorKind;
  readonly probedAt: string;
}

/** Vite config load failure details (mirrors main-process payload). */
export interface ViteConfigDiagnostics {
  readonly configFilePath: string | null;
  readonly configFileRelative: string | null;
  readonly importsDiscovered: readonly string[];
  readonly missingImports: readonly string[];
  readonly syntaxParseResult: string;
  readonly firstException: string | null;
  readonly exceptionName: string | null;
  readonly stackTrace: string | null;
  readonly rootCauseLine: string;
  readonly fullOutput: string;
}

/** IPC payload when preview start fails (mirrors main-process diagnostics). */
export interface PreviewDiagnostics {
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
  readonly viteConfig: ViteConfigDiagnostics | null;
}

export interface GreenfieldPreviewStartResult {
  readonly ok: boolean;
  readonly url?: string;
  readonly error?: string;
  readonly diagnostics?: PreviewDiagnostics;
}

export interface GreenfieldPreviewState {
  readonly running: boolean;
  readonly url: string | null;
  readonly root: string | null;
  readonly port: number;
  readonly lastSuccessfulPreviewAt: string | null;
  readonly processExited: boolean;
  readonly lastFailureDiagnostics: PreviewDiagnostics | null;
}
