/**
 * Shared types for BryantLabs Studio.
 *
 * Phase 2 adds workspace types (project + read-only filesystem access). These
 * describe data shapes only — no AI, generation, or write behaviour exists.
 */

export type PanelId = "explorer" | "editor" | "preview" | "terminal";

export interface PanelMeta {
  readonly id: PanelId;
  readonly title: string;
  readonly subtitle: string;
}

export interface AppInfo {
  readonly name: string;
  readonly phase: string;
  readonly version: string;
  readonly tagline: string;
}

/** A currently opened project folder. */
export interface ProjectInfo {
  readonly path: string;
  readonly name: string;
}

/** A single entry in the file tree. */
export interface FileNode {
  readonly name: string;
  readonly path: string;
  readonly type: "file" | "directory";
}

/** Result of a read-only file read from the main process. */
export interface ReadFileResult {
  readonly content: string;
  readonly language: string | null;
  readonly readable: boolean;
  readonly reason?: string;
}

/** ---- Project intelligence (Phase 3) ---- */

export interface ProjectDetections {
  readonly packageJson: boolean;
  readonly tsconfig: boolean;
  readonly viteConfig: boolean;
  readonly electron: boolean;
  readonly react: boolean;
  readonly nextjs: boolean;
  readonly node: boolean;
}

export type PackageDependencyKind =
  | "dependencies"
  | "devDependencies"
  | "peerDependencies";

export interface PackageDependency {
  readonly name: string;
  readonly version: string;
  readonly kind: PackageDependencyKind;
}

export interface ProjectSummary {
  readonly name: string;
  readonly framework: string;
  readonly language: string;
  readonly bundler: string;
  readonly totalFiles: number;
  readonly totalFolders: number;
  readonly entryPoints: string[];
  readonly packageManager: string;
  readonly detections: ProjectDetections;
}

export interface FileEntry {
  readonly path: string;
  readonly absPath: string;
}

export interface SymbolLocation {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly line: number;
}

export interface FileIndex {
  readonly path: string;
  readonly imports: string[];
  readonly exports: string[];
  readonly components: string[];
  readonly functions: string[];
  readonly hooks: string[];
  readonly classes: string[];
  readonly interfaces: string[];
  readonly types: string[];
  readonly referencedNames: string[];
  readonly symbolLocations?: readonly SymbolLocation[];
}

export type SymbolKind =
  | "component"
  | "function"
  | "export"
  | "hook"
  | "class"
  | "interface"
  | "type";

export interface SymbolEntry {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly path: string;
  readonly absPath: string;
  readonly line?: number | null;
}

export interface SymbolGraphNode {
  readonly name: string;
  readonly kind: SymbolKind;
  readonly definedIn: string;
  readonly absPath: string;
  readonly referencedBy: readonly string[];
}

export interface RepositoryStats {
  readonly totalFiles: number;
  readonly totalComponents: number;
  readonly totalFunctions: number;
  readonly totalHooks: number;
  readonly totalClasses: number;
  readonly totalInterfaces: number;
  readonly totalTypes: number;
  readonly totalImports: number;
  readonly totalExports: number;
}

export interface ProjectScan {
  readonly summary: ProjectSummary;
  readonly files: FileEntry[];
  readonly index: FileIndex[];
  readonly symbols: SymbolEntry[];
  readonly symbolGraph: SymbolGraphNode[];
  readonly repositoryStats: RepositoryStats;
  /** package.json dependency entries (Phase 19). */
  readonly dependencies: readonly PackageDependency[];
  /** Human-readable project summary for agents (Phase 19). */
  readonly repositorySummary: string;
  readonly scannedAt: number;
}

/** Result of a write operation from the main process. */
export interface EditResult {
  readonly ok: boolean;
  readonly content?: string;
  readonly path?: string;
  readonly reason?: string;
}

/** ---- Build & verification (Phase 6) ---- */

export interface CommandResult {
  readonly command: string;
  readonly ok: boolean;
  readonly exitCode: number | null;
  readonly stdout: string;
  readonly stderr: string;
  readonly durationMs: number;
  readonly errorCount: number;
  readonly warningCount: number;
  readonly timedOut: boolean;
  readonly truncated: boolean;
}

export interface VerificationResult {
  readonly typecheck: CommandResult;
  readonly build: CommandResult;
  readonly ranAt: number;
}

/** ---- Provider system (Phase 7) ---- */

export type {
  ProviderId,
  ProviderSettings,
  ProviderSettingsInput,
  HealthResult,
  HealthCheck,
  ProviderResponse,
  ProviderInfo,
} from "@/core/providers/types";

export type {
  PlanContext,
  AIPlan,
  AIPlanFile,
  AIPlanResult,
  PlanAgreement,
  AIPatchProposal,
  AIPatchResult,
  AIPatchSession,
  AIPatchApplyStatus,
  PatchSymbol,
  PatchTargetFile,
  PlanPatchMeta,
} from "@/core/planner/aiTypes";

export type { ApplyPlanBatchPatchResult } from "@/core/planApply/types";

import type { ApplyPlanBatchPatchResult } from "@/core/planApply/types";

import type {
  ProviderId,
  ProviderSettings,
  ProviderSettingsInput,
  HealthResult,
  ProviderResponse,
} from "@/core/providers/types";

import type {
  PlanContext,
  AIPlanResult,
  AIPatchResult,
  PatchTargetFile,
  PatchSymbol,
  PlanPatchMeta,
} from "@/core/planner/aiTypes";

export type {
  GeneratedFile,
  GreenfieldGenerateResult,
  GreenfieldWriteResult,
  GreenfieldSetupResult,
  GreenfieldPreviewState,
  GreenfieldPreviewStartResult,
  GreenfieldPreviewProbeResult,
  PreviewDiagnostics,
} from "@/core/greenfield/types";

import type {
  GeneratedFile,
  GreenfieldGenerateResult,
  GreenfieldSetupResult,
  GreenfieldPreviewState,
  GreenfieldPreviewStartResult,
  GreenfieldPreviewProbeResult,
} from "@/core/greenfield/types";

/** The bridge exposed by the Electron preload script. */
export interface BryantLabsApi {
  readonly phase: number;
  readonly isDesktop: boolean;
  openProject(): Promise<ProjectInfo | null>;
  /** Open a project at a known folder path (no dialog). */
  openProjectAt(folderPath: string): Promise<ProjectInfo | null>;
  listDirectory(dirPath: string): Promise<FileNode[]>;
  readFile(filePath: string): Promise<ReadFileResult>;
  scanProject(): Promise<ProjectScan | null>;
  /** Incremental project index status (warm cache / delta updates). */
  getProjectIndexStatus(): Promise<import("@/core/projectIndex/types").ProjectIndexStatus>;
  rescanProject(): Promise<ProjectScan | null>;
  onProjectIndexUpdated(
    handler: (event: import("@/core/projectIndex/types").ProjectIndexUpdatedEvent) => void,
  ): () => void;
  onProjectIndexStatus(
    handler: (status: import("@/core/projectIndex/types").ProjectIndexStatus) => void,
  ): () => void;
  onSemanticIndexUpdated(
    handler: (event: { readonly builtAt: number }) => void,
  ): () => void;
  /** Live project problems (debounced tsc --noEmit). */
  getProjectProblemsStatus(): Promise<
    import("@/core/diagnostics/projectProblems").ProjectProblemsStatus
  >;
  refreshProjectProblems(): Promise<
    import("@/core/diagnostics/projectProblems").ProjectProblemsStatus
  >;
  onProjectProblemsUpdated(
    handler: (
      status: import("@/core/diagnostics/projectProblems").ProjectProblemsStatus,
    ) => void,
  ): () => void;
  /** Load persisted project memory from disk (Phase 19). */
  readProjectMemory(): Promise<import("@/core/projectMemory/types").ProjectMemory | null>;
  /** Save project memory under the open project (Phase 19). */
  writeProjectMemory(
    memory: import("@/core/projectMemory/types").ProjectMemory,
  ): Promise<{ ok: boolean; reason?: string }>;
  /** Phase 25 — persistent agent memory store. */
  readAgentMemory(): Promise<import("@/core/memory/types").AgentMemoryStore | null>;
  writeAgentMemory(
    store: import("@/core/memory/types").AgentMemoryStore,
  ): Promise<{ ok: boolean; reason?: string }>;
  /** Project Intelligence V1 — persisted session memory. */
  readSessionMemory(): Promise<import("@/core/sessionMemory/types").SessionMemorySnapshot | null>;
  writeSessionMemory(
    memory: Omit<
      import("@/core/sessionMemory/types").SessionMemorySnapshot,
      "timeline"
    >,
  ): Promise<{ ok: boolean; reason?: string }>;
  /** Code-derived feature inventory. */
  readFeatureInventory(): Promise<import("@/core/intelligence/types").FeatureInventorySnapshot | null>;
  writeFeatureInventory(
    inventory: import("@/core/intelligence/types").FeatureInventorySnapshot,
  ): Promise<{ ok: boolean; reason?: string }>;
  /** Persisted run checkpoint for resume-after-restart (Electron userData). */
  loadRunCheckpoint(
    projectPath: string,
  ): Promise<import("@/core/runPersistence/types").PersistedRunCheckpoint | null>;
  saveRunCheckpoint(
    checkpoint: import("@/core/runPersistence/types").PersistedRunCheckpoint,
  ): Promise<{ ok: boolean; reason?: string }>;
  clearRunCheckpoint(projectPath: string): Promise<{ ok: boolean; reason?: string }>;
  /** Current git branch when available (read-only). */
  getGitBranch(): Promise<string | null>;
  /** Full git status snapshot for the open project. */
  getGitStatus(): Promise<import("@/core/git/types").GitStatusSnapshot | null>;
  getGitDiffContents(
    relPath: string,
  ): Promise<import("@/core/git/types").GitDiffContents & { error?: string }>;
  gitStage(paths: string[]): Promise<import("@/core/git/types").GitActionResult>;
  gitUnstage(paths: string[]): Promise<import("@/core/git/types").GitActionResult>;
  gitRestore(paths: string[]): Promise<import("@/core/git/types").GitActionResult>;
  gitCommit(
    message: string,
  ): Promise<import("@/core/git/types").GitCommitResult>;
  /** Apply a deterministic, user-approved edit (Phase 5). */
  applyEdit(
    filePath: string,
    expectedBefore: string,
    after: string,
  ): Promise<EditResult>;
  /** Create a new file under the project (multi-file execution). */
  createProjectFile(filePath: string, content: string): Promise<EditResult>;
  deleteProjectFile(filePath: string): Promise<EditResult>;
  /** Undo the last applied edit (single level). */
  undoLastEdit(): Promise<EditResult>;
  /** Run build + typecheck verification in the project (Phase 6). */
  verify(): Promise<VerificationResult | { error: string }>;
  /** ---- Platform: MCP tool host ---- */
  getMcpStatus(): Promise<import("@/core/mcp/types").McpHostStatus>;
  listMcpTools(): Promise<readonly import("@/core/mcp/types").McpToolDefinition[]>;
  invokeMcpTool(
    tool: string,
    args: Record<string, unknown>,
  ): Promise<import("@/core/mcp/types").McpToolResult>;
  /** ---- Platform: semantic index (TF-IDF, local) ---- */
  getSemanticIndexStatus(): Promise<import("@/core/semanticIndex/types").SemanticIndexStatus>;
  hydrateSemanticIndex(): Promise<{ ok: boolean }>;
  rebuildSemanticIndex(): Promise<{ ok: boolean; reason?: string }>;
  semanticSearch(
    query: string,
    limit?: number,
  ): Promise<readonly import("@/core/semanticIndex/types").SemanticSearchHit[]>;
  grepProject(
    pattern: string,
    limit?: number,
  ): Promise<
    | { readonly hits: readonly { readonly path: string; readonly line: number; readonly text: string }[] }
    | { readonly error: string }
  >;
  /** ---- Provider system (Phase 7) — read-only model communication ---- */
  getProviderSettings(): Promise<ProviderSettings>;
  saveProviderSettings(input: ProviderSettingsInput): Promise<ProviderSettings>;
  revealProviderApiKey(
    provider: ProviderId,
  ): Promise<{ ok: boolean; key?: string; error?: string }>;
  checkProviderHealth(provider: ProviderId): Promise<HealthResult>;
  testProvider(provider: ProviderId, prompt: string): Promise<ProviderResponse>;
  agentStepWithProvider(
    provider: ProviderId,
    prompt: string,
  ): Promise<import("@/core/providers/types").AgentStepResponse>;
  /** ---- AI planning (Phase 7.5) — plan only, no edits ---- */
  planWithProvider(
    provider: ProviderId,
    prompt: string,
    context: PlanContext,
  ): Promise<AIPlanResult>;
  /** ---- AI patch planning (Phase 8) — proposal only, never applied ---- */
  proposePatch(
    provider: ProviderId,
    prompt: string,
    context: PlanContext,
    file: PatchTargetFile,
    symbols: PatchSymbol[],
    planMeta?: PlanPatchMeta,
  ): Promise<AIPatchResult>;
  /** Apply Plan — batch @@FILE marker patches for multiple targets. */
  proposeApplyPlanPatches(
    provider: ProviderId,
    prompt: string,
    context: PlanContext,
    files: readonly PatchTargetFile[],
    meta: {
      planSummary: string;
      targetPaths: string[];
      repair?: boolean;
      slimContext?: boolean;
      repairMissingPaths?: string[];
      directRewrite?: boolean;
      intelligenceBlock?: string;
      contextNotes?: string;
      uiEditMode?: boolean;
    },
  ): Promise<ApplyPlanBatchPatchResult>;
  /** Phase 13 — targeted repair proposal after verification failure. */
  proposeAutoFix(
    provider: ProviderId,
    context: import("@/core/autoFix/types").AutoFixContext,
    file: PatchTargetFile,
  ): Promise<AIPatchResult>;
  /** ---- Greenfield generation (Phase 10) ---- */
  greenfieldSelectFolder(): Promise<ProjectInfo | { error: string } | null>;
  greenfieldGenerate(
    provider: ProviderId,
    prompt: string,
  ): Promise<GreenfieldGenerateResult>;
  /** Multi-phase greenfield — prompt sent as-is (no seven-file wrapper). */
  greenfieldGenerateRaw(
    provider: ProviderId,
    prompt: string,
  ): Promise<GreenfieldGenerateResult>;
  greenfieldWrite(
    root: string,
    files: GeneratedFile[] | import("@/core/greenfield/types").GreenfieldProjectFile[],
  ): Promise<
    | { ok: true; written: string[]; logs?: import("@/core/greenfield/writeLog").WriteFileLogEntry[] }
    | {
        ok: false;
        written: string[];
        errors: string[];
        logs?: import("@/core/greenfield/writeLog").WriteFileLogEntry[];
      }
    | { error: string; code?: "FOLDER_NOT_EMPTY" }
  >;
  greenfieldNextNumberedFolder(
    current: string,
  ): Promise<ProjectInfo | { error: string }>;
  greenfieldClearFolder(root: string): Promise<{ ok: true } | { error: string }>;
  greenfieldSetup(root: string): Promise<GreenfieldSetupResult | { error: string }>;
  greenfieldTypecheck(
    root: string,
  ): Promise<
    | {
        typecheck: CommandResult;
        typecheckDetails?: import("@/core/greenfield/tscDiagnostics").TypeScriptCheckDetails;
      }
    | { error: string }
  >;
  greenfieldBuild(
    root: string,
  ): Promise<{ build: CommandResult } | { error: string }>;
  greenfieldPreviewStart(root: string): Promise<GreenfieldPreviewStartResult>;
  greenfieldPreviewStop(): Promise<{ ok: boolean }>;
  greenfieldPreviewState(): Promise<GreenfieldPreviewState>;
  greenfieldPreviewProbe(url: string): Promise<GreenfieldPreviewProbeResult>;
  greenfieldPreviewOpenExternal(url: string): Promise<{ ok: boolean; error?: string }>;
  greenfieldUiAudit(
    url: string,
  ): Promise<import("@/core/greenfield/uiAudit").UiAuditSnapshotTransport>;
  /** Interactive project shell (PTY) in the bottom dock. */
  terminalCreate(
    cwd: string,
    cols?: number,
    rows?: number,
  ): Promise<{ id: string } | { error: string }>;
  terminalWrite(id: string, data: string): Promise<{ ok: boolean; reason?: string }>;
  terminalResize(
    id: string,
    cols: number,
    rows: number,
  ): Promise<{ ok: boolean; reason?: string }>;
  terminalKill(id: string): Promise<{ ok: boolean }>;
  terminalExec(
    cwd: string,
    command: string,
  ): Promise<
    | {
        ok: boolean;
        exitCode: number | null;
        stdout: string;
        stderr: string;
        durationMs: number;
        timedOut: boolean;
        truncated: boolean;
        error?: string;
      }
    | { error: string }
  >;
  onTerminalData(handler: (payload: { id: string; data: string }) => void): () => void;
  onTerminalExit(handler: (payload: { id: string; exitCode: number }) => void): () => void;
}

declare global {
  interface Window {
    readonly bryantlabs?: BryantLabsApi;
  }
}
