import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import type { CurrentAppContext } from "@/core/agent/agentAppContext";
import type { AutoFixSession } from "@/core/autoFix";
import type { BuilderApprovalMode, BuilderSession } from "@/core/builder";
import type { AgentWorkspaceSession } from "@/core/agentWorkspace";
import type { AgentLoopSession } from "@/core/agentLoop";
import type { ExecutionLogState } from "@/core/console/executionLogService";
import type { ContextSnapshot } from "@/core/contextInspector";
import type { EditKind, EditParams, Patch } from "@/core/editor";
import type { ExecutionSession } from "@/core/execution";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type {
  CenterTab,
  DockTab,
  InsightsTab,
  RailTool,
} from "@/core/layout/types";
import type {
  AgentMemoryStore,
  MemoryAnalytics,
  MemoryCandidate,
  MemoryRecordInput,
  MemoryRetrievalResult,
} from "@/core/memory";
import type { PlanApplyFileDecision, PlanApplySession } from "@/core/planApply";
import type { Plan } from "@/core/planner";
import type {
  AIPlanResult,
  AIPatchApplyStatus,
  AIPatchSession,
} from "@/core/planner/aiTypes";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import type { ProviderStatusSnapshot } from "@/core/providers/providerStatus";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { ProjectIntelligence } from "@/core/projectIntelligence/types";
import type {
  RepositoryIndex,
  RepositoryRelevanceResult,
  RepositorySearchHit,
  SymbolReferenceInfo,
} from "@/core/repository";
import type { SmartFileSelectionResult } from "@/core/fileSelection";
import type { PersistedRunCheckpoint } from "@/core/runPersistence";
import type { StudioAnalyticsRecord } from "@/core/analytics";
import type { StudioFailureReport } from "@/core/diagnostics/failureReport";
import type {
  SessionMemoryDiagnostics,
  SessionMemorySnapshot,
} from "@/core/sessionMemory";
import type { ExecuteApplyPlanResult } from "@/app/orchestration";
import type { AIPatchStatus } from "@/app/orchestration";
import type {
  OpenFile,
  WorkspaceFileStatus,
  WorkspaceScanStatus,
} from "@/app/workspace/types";
import type { ProjectIndexStatus } from "@/core/projectIndex/types";
import type {
  ProjectProblem,
  ProjectProblemsStatus,
} from "@/core/diagnostics/projectProblems";
import type {
  FileNode,
  ProjectInfo,
  ProjectScan,
  VerificationResult,
} from "@/types";

export interface EditTarget {
  readonly path: string;
  readonly absPath: string;
}

export type FileStatus = WorkspaceFileStatus;
export type ScanStatus = WorkspaceScanStatus;
export type EditStatus = "idle" | "applying" | "applied" | "error";
export type VerifyStatus = "idle" | "running" | "done" | "error";
export type AIPlanStatus = "idle" | "running" | "done" | "error";

export interface WorkspaceState {
  /** True when running inside the Electron shell (bridge available). */
  readonly isDesktop: boolean;
  readonly project: ProjectInfo | null;
  readonly activeFile: OpenFile | null;
  readonly activePath: string | null;
  readonly fileStatus: FileStatus;
  readonly error: string | null;
  readonly scan: ProjectScan | null;
  readonly scanStatus: ScanStatus;
  /** Incremental index coordinator status from the main process. */
  readonly projectIndexStatus: ProjectIndexStatus | null;
  /** In-memory repository intelligence (Phase 12). */
  readonly repository: RepositoryIndex | null;
  repositorySearch(query: string): RepositorySearchHit[];
  findSymbolReferences(symbolName: string): SymbolReferenceInfo[];
  repositoryRelevance(prompt: string): RepositoryRelevanceResult | null;
  /** Phase 22 — ranked file targets for the latest plan prompt. */
  readonly smartFileSelection: SmartFileSelectionResult | null;
  readonly plan: Plan | null;
  // ---- Safe editing (Phase 5) ----
  readonly editTarget: EditTarget | null;
  readonly pendingPatch: Patch | null;
  readonly reviewing: boolean;
  readonly editStatus: EditStatus;
  readonly editError: string | null;
  readonly canUndo: boolean;
  // ---- Build & verification (Phase 6) ----
  readonly verification: VerificationResult | null;
  readonly verifyStatus: VerifyStatus;
  readonly verifyError: string | null;
  /** Path of the most recent applied edit, associated with verification runs. */
  readonly lastEditedPath: string | null;
  /** Live TypeScript / Monaco problems for the open project. */
  readonly projectProblems: readonly ProjectProblem[];
  readonly problemsStatus: ProjectProblemsStatus;
  refreshProjectProblems(): Promise<void>;
  openProblem(problem: ProjectProblem): void;
  /** Jump the editor to a line after opening a problem. */
  readonly editorReveal: { readonly line: number; readonly column: number } | null;
  clearEditorReveal(): void;
  openProject(): Promise<void>;
  openFile(node: FileNode): Promise<void>;
  openPath(absPath: string): Promise<void>;
  activateFile(path: string): void;
  closeFile(path: string): void;
  readonly openFileTabs: readonly string[];
  editorContent(path: string): string | null;
  isEditorDirty(path: string): boolean;
  updateEditorDraft(path: string, content: string): void;
  saveEditorFile(path?: string): Promise<boolean>;
  revertEditorDraft(): void;
  readonly editorSaveStatus: import("@/app/workspace/useWorkspaceDirectEdit").EditorSaveStatus;
  readonly editorSaveError: string | null;
  listDirectory(dirPath: string): Promise<FileNode[]>;
  rescan(): Promise<void>;
  /** Build a read-only modification plan from a prompt. Returns null if unavailable. */
  createPlan(prompt: string): Plan | null;
  clearPlan(): void;
  // ---- AI planning (Phase 7.5) ----
  readonly aiPlan: AIPlanResult | null;
  readonly aiPlanStatus: AIPlanStatus;
  readonly lastPlanPrompt: string | null;
  /** Run the active provider against the last planned prompt (plan only). */
  runAIPlan(): Promise<boolean>;
  // ---- Session memory (Phase 14) ----
  readonly sessionMemory: SessionMemorySnapshot;
  readonly sessionMemoryDiagnostics: SessionMemoryDiagnostics | null;
  clearSessionMemory(): void;
  clearPromptHistory(): void;
  clearFailureHistory(): void;
  /** Persisted project notes (Phase 19). */
  readonly projectMemory: ProjectMemory;
  readonly projectMemoryError: string | null;
  saveProjectMemory(
    patch: Partial<
      Pick<
        ProjectMemory,
        "projectName" | "architecture" | "userPreferences" | "notes"
      >
    >,
  ): Promise<void>;
  /** Project intelligence — stack, patterns, learnings from runs. */
  readonly projectIntelligence: ProjectIntelligence;
  /** Phase 25 — persistent agent memory engine. */
  readonly agentMemoryStore: AgentMemoryStore;
  readonly memoryAnalytics: MemoryAnalytics;
  readonly lastMemoryRetrieval: MemoryRetrievalResult | null;
  readonly pendingMemoryCandidates: readonly MemoryCandidate[];
  addAgentMemoryRecord(input: MemoryRecordInput): Promise<void>;
  updateAgentMemoryRecord(
    id: string,
    patch: Partial<
      Pick<
        import("@/core/memory/types").AgentMemoryRecord,
        "title" | "content" | "pinned" | "archived" | "tags" | "metadata"
      >
    >,
  ): Promise<void>;
  deleteAgentMemoryRecord(id: string): Promise<void>;
  setAgentMemoryAutoSave(enabled: boolean): Promise<void>;
  acceptMemoryCandidate(index: number): Promise<void>;
  acceptAllMemoryCandidates(): Promise<void>;
  rejectMemoryCandidates(): void;
  exportAgentMemoryJson(): string;
  importAgentMemoryJson(json: string): Promise<void>;
  // ---- Context inspector (Phase 21) ----
  readonly contextSnapshot: ContextSnapshot | null;
  readonly contextInspectorDraft: ContextSnapshot | null;
  readonly contextHistory: readonly ContextSnapshot[];
  readonly selectedContextId: string | null;
  readonly showContextRequestPreview: boolean;
  setShowContextRequestPreview(show: boolean): void;
  selectContextSnapshot(id: string | null): void;
  refreshContextInspectorDraft(): void;
  // ---- Multi-file execution (Phase 15) ----
  readonly executionSession: ExecutionSession | null;
  readonly executionError: string | null;
  startMultiFileExecution(): Promise<void>;
  runMultiFileExecution(): Promise<void>;
  cancelMultiFileExecution(): void;
  retryExecutionStep(): Promise<void>;
  skipExecutionStep(): Promise<void>;
  regenerateExecutionStep(): Promise<void>;
  // ---- Autonomous app builder (Phase 16) ----
  readonly builderSession: BuilderSession | null;
  readonly builderError: string | null;
  startAutonomousBuild(
    goalPrompt: string,
    mode: BuilderApprovalMode,
  ): Promise<void>;
  pauseAutonomousBuild(): void;
  resumeAutonomousBuild(): Promise<void>;
  stopAutonomousBuild(): void;
  approveBuilderPhase(): Promise<void>;
  // ---- Agent workspace (Phase 17) ----
  readonly agentSession: AgentWorkspaceSession | null;
  exportAgentReport(format: "markdown" | "json"): void;
  clearAgentSession(): void;
  // ---- Studio agent (Phase 18) ----
  readonly agentLoopSession: AgentLoopSession | null;
  readonly agentLoopError: string | null;
  /** When set, Start Agent stays disabled until scan/repo/project is ready. */
  readonly agentStartBlockReason: string | null;
  readonly agentStartDisabled: boolean;
  startAgent(goalPrompt: string): Promise<void>;
  pauseAgent(): void;
  resumeAgent(): Promise<void>;
  stopAgent(): void;
  approveAgentAction(): Promise<void>;
  // ---- Plan apply (multi-file patch from plan) ----
  readonly planApplySession: PlanApplySession | null;
  readonly planApplyReviewing: boolean;
  readonly planApplyError: string | null;
  /** Propose patches for each plan file and open diff review. */
  startApplyPlan(opts?: { autoContinue?: boolean }): Promise<ExecuteApplyPlanResult>;
  /** Shorter @@FILE-only rewrite after format repair failed. */
  runApplyPlanDirectRewrite(): Promise<void>;
  cancelApplyPlan(): void;
  selectPlanApplyFile(relPath: string): void;
  setPlanApplyFileDecision(
    relPath: string,
    decision: PlanApplyFileDecision,
  ): void;
  approveAllPlanApplyFiles(): void;
  /** Write approved files, then run typecheck + build. */
  applyApprovedPlanFiles(opts?: {
    pipelineMode?: boolean;
  }): Promise<{
    ok: boolean;
    verification: VerificationResult | null;
    applied: readonly string[];
    error?: string;
  }>;
  // ---- Multi-agent pipeline (Phase 26) ----
  readonly pipelineSession: import("@/core/pipeline/types").PipelineSession | null;
  readonly pipelineRunning: boolean;
  readonly pipelineError: string | null;
  runMultiAgentPipeline(prompt: string): Promise<void>;
  continueMultiAgentPipeline(): void;
  continueMultiAgentPipelineRepair(): Promise<void>;
  cancelMultiAgentPipeline(): void;
  // ---- Unified Build loop (Level Up) ----
  readonly buildRunning: boolean;
  readonly buildError: string | null;
  readonly buildStatus: import("@/core/build").BuildLoopStatus;
  runBuildLoop(prompt: string): Promise<void>;
  continueBuildAfterReview(): Promise<void>;
  cancelBuildLoop(): void;
  retryApplyPlanReview(): Promise<void>;
  // ---- Follow-up Build V2 ----
  readonly followUpChat: readonly import("@/core/build/followUpChat").FollowUpChatMessage[];
  /** Unified Agent conversation (project chat or pre-project pending messages). */
  readonly agentChat: readonly import("@/core/build/followUpChat").FollowUpChatMessage[];
  readonly followUpCheckpoint: import("@/core/build/followUpCheckpoint").FollowUpCheckpoint | null;
  readonly followUpSuccess: import("@/core/build/followUpRun").FollowUpSuccessSnapshot | null;
  recordFollowUpUserMessage(prompt: string): void;
  recordAgentUserMessage(prompt: string): void;
  recordAgentStudioMessage(
    text: string,
    meta?: {
      filesModified?: readonly string[];
      provider?: string;
      model?: string;
      durationMs?: number;
      previewReady?: boolean;
      prompt?: string;
      typecheckPassed?: boolean;
      buildPassed?: boolean;
      verification?: import("@/types").VerificationResult | null;
      planSummary?: string;
      snapshotFiles?: readonly import("@/core/build/followUpCheckpoint").FollowUpCheckpointFile[];
    },
  ): void;
  recordAgentActivityMessage(text: string): void;
  recordAgentGreenfieldSuccess(input: {
    prompt: string;
    filesWritten: readonly string[];
    typecheckPassed: boolean;
    buildPassed: boolean;
    previewReady: boolean;
    uiAuditPassed: boolean;
  }): void;
  dismissFollowUpSuccess(): void;
  undoFollowUpChange(): Promise<void>;
  readonly followUpSnapshots: readonly import("@/core/build/followUpSnapshots").FollowUpSnapshot[];
  readonly followUpActivityRuns: readonly import("@/core/build/followUpActivityLog").FollowUpActivityRun[];
  readonly agentRunHistory: readonly AgentRunArtifact[];
  readonly selectedAgentRunId: string | null;
  readonly selectedArtifactDiffPath: string | null;
  readonly activeAgentRunId: string | null;
  selectAgentRun(runId: string | null): void;
  focusArtifactDiff(input: { readonly runId?: string | null; readonly path: string }): void;
  readonly inspectorSession: import("@/core/agent/runInspectorSession").RunInspectorSession;
  openRunInspector(runId: string): void;
  closeRunInspector(): void;
  setInspectorTab(tab: import("@/core/agent/runInspector").RunInspectorTab): void;
  setCenterInspectorActive(runId: string | null): void;
  lockInspectorRun(runId: string): void;
  readonly diagnosticReportSession: import("@/core/diagnostics/diagnosticReportSession").DiagnosticReportSession;
  openDiagnosticReport(
    input: import("@/app/workspace/useDiagnosticReportController").OpenDiagnosticReportInput,
  ): void;
  closeDiagnosticReport(): void;
  readonly compareRunIds: readonly string[];
  readonly compareSession: import("@/app/workspace/useRunCompareController").RunCompareSession;
  toggleCompareRun(runId: string): void;
  clearCompareRuns(): void;
  openRunCompare(leftRunId: string, rightRunId: string): void;
  openSelectedCompare(): void;
  closeRunCompare(): void;
  readonly projectHealth: import("@/core/build/projectHealth").ProjectHealthSnapshot | null;
  readonly projectFacts: readonly import("@/core/build/projectFacts").ProjectFact[];
  readonly currentAppContext: CurrentAppContext | null;
  readonly followUpEscalation: import("@/core/build/providerAutoEscalation").FollowUpEscalationState | null;
  restoreFollowUpSnapshot(snapshot: import("@/core/build/followUpSnapshots").FollowUpSnapshot): Promise<void>;
  runImproveAppMode(): Promise<void>;
  startUiAuditAdvisoryFix(
    advisory: import("@/core/agent/executionDashboard").ExecutionDashboardUiAuditAdvisory,
  ): Promise<void>;
  startPreferredMemoryFix(
    recommendation: import("@/core/projectIntelligence/types").MemoryRecommendation,
  ): Promise<void>;
  readonly featureInventory: import("@/core/intelligence/types").FeatureInventorySnapshot | null;
  readonly complexityRouting: import("@/core/intelligence/types").ComplexityRoutingDecision | null;
  analyzeFeasibility(prompt: string): import("@/core/intelligence/types").FeasibilityResult;
  persistSessionMemoryNow(): Promise<void>;
  readonly agentRunBlockReason: string | null;
  readonly agentGreenfieldPanelActive: boolean;
  readonly agentWorkflowBusy: boolean;
  setAgentGreenfieldPanelActive(active: boolean): void;
  cancelGreenfieldRun(): void;
  triggerGreenfieldRepair(): Promise<void>;
  registerGreenfieldRunControl(
    control: { cancel: () => void; runRepair?: () => Promise<void> } | null,
  ): void;
  // ---- Autonomous fix loop (Phase 13) ----
  readonly autoFixSession: AutoFixSession | null;
  approveAutoFixRepair(): Promise<void>;
  cancelAutoFix(): void;
  // ---- AI patch planning (Phase 8) / application (Phase 9) ----
  readonly aiPatchSession: AIPatchSession | null;
  readonly patchStatus: AIPatchStatus;
  readonly patchError: string | null;
  readonly aiPatchApproved: boolean;
  readonly aiPatchApplyStatus: AIPatchApplyStatus;
  readonly aiPatchApplyError: string | null;
  /** Ask the active provider to propose a patch for the open file. */
  proposeAIPatch(
    prompt: string,
    opts?: { readonly selection?: import("@/core/editor/inlineEdit").InlineEditSelection },
  ): Promise<void>;
  /** Explicit human approval after reviewing the diff (required before apply). */
  approveAIPatch(): void;
  discardAIPatchApproval(): void;
  rejectAIPatch(): void;
  /** Apply the approved AI proposal via the Phase 5 safe write engine. */
  applyAIPatch(): Promise<void>;
  /** Select a planned file as the (only) approved edit target. */
  selectEditTarget(target: EditTarget): void;
  clearEditTarget(): void;
  /** Compute a deterministic patch for the active edit target. */
  proposeEdit(kind: EditKind, params: EditParams): void;
  reviewPatch(): void;
  discardPatch(): void;
  /** Apply the reviewed patch (writes to disk after approval). */
  applyPatch(): Promise<void>;
  undoLastEdit(): Promise<void>;
  /** Run build + typecheck verification. */
  runVerification(): Promise<void>;
  // ---- Greenfield (Phase 10) ----
  readonly appPreview: {
    url: string | null;
    running: boolean;
    root: string | null;
    lastSuccessfulPreviewAt: number | null;
    port: number | null;
  };
  setAppPreview(state: {
    url: string | null;
    running: boolean;
    root?: string | null;
    lastSuccessfulPreviewAt?: number | null;
    port?: number | null;
  }): void;
  readonly previewTabNonce: number;
  requestPreviewTab(): void;
  openProjectAt(folderPath: string): Promise<void>;
  // ---- Layout (BLAI-style shell) ----
  readonly railTool: RailTool;
  setRailTool(tool: RailTool): void;
  readonly centerTab: CenterTab;
  setCenterTab(tab: CenterTab): void;
  readonly dockTab: DockTab;
  setDockTab(tab: DockTab): void;
  /** Advanced developer console (hidden by default). */
  readonly developerConsoleEnabled: boolean;
  setDeveloperConsoleEnabled(enabled: boolean): void;
  openDeveloperConsole(): void;
  readonly developerConsole: ExecutionLogState;
  selectDeveloperConsoleRun(runId: string | null): void;
  viewCurrentDeveloperConsoleRun(): void;
  readonly commandPaletteOpen: boolean;
  setCommandPaletteOpen(open: boolean): void;
  readonly dockOpen: boolean;
  toggleDock(): void;
  openDock(): void;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  updateGreenfieldRun(patch: Partial<GreenfieldRunSnapshot>): void;
  resetGreenfieldRun(): void;
  /** Clear stale locks, cancel in-flight work, and reset run history selection. */
  resetAgentRunState(): void;
  /** True when a prior run left plan/apply/verification state behind. */
  readonly staleRunContextPresent: boolean;
  /** Clear plan, AI plan, apply session, errors, and verification before a new run. */
  clearRunContextForNewSubmit(): void;
  /** Archive live plan/verification after success; preserves run history and inspector data. */
  archiveActiveRunContextAfterSuccess(): void;
  appendGreenfieldRunLog(
    stage: GreenfieldRunLogEntry["stage"],
    status: GreenfieldRunLogEntry["status"],
    message: string,
    details?: string,
  ): void;
  /** Push structured failure report into run snapshot and logs (observability only). */
  publishFailureReport(report: StudioFailureReport): void;
  /** Active provider + last health snapshot for the title bar pill. */
  readonly providerStatus: ProviderStatusSnapshot | null;
  /** Re-run provider health check (read-only; does not change generation). */
  refreshProviderStatus(opts?: { logToRun?: boolean }): Promise<void>;
  /** Provider reliability wrapper for greenfield generation. */
  invokeGreenfieldCall: <T extends import("@/core/providers/stageInvoke").StageProviderResult>(
    settings: ProviderSettings,
    estimatedTokens: number,
    call: (provider: ProviderId) => Promise<T>,
    promptPayload?: string,
    recordPurpose?: import("@/core/providers/costControls").AiCallGatePurpose,
  ) => Promise<T | null>;
  /** Raw phased greenfield provider call (prompt as-is). */
  invokeGreenfieldRawCall: <T extends import("@/core/providers/stageInvoke").StageProviderResult>(
    settings: ProviderSettings,
    estimatedTokens: number,
    call: (provider: ProviderId) => Promise<T>,
    promptPayload?: string,
    recordPurpose?: import("@/core/providers/costControls").AiCallGatePurpose,
  ) => Promise<T | null>;
  /** Final App.tsx-only call using greenfield routing and the setup-repair budget slot. */
  invokeGreenfieldReservedCompletion: <T extends import("@/core/providers/stageInvoke").StageProviderResult>(
    settings: ProviderSettings,
    estimatedTokens: number,
    call: (provider: ProviderId) => Promise<T>,
    promptPayload?: string,
  ) => Promise<T | null>;
  readonly resetAiCallTracker: () => void;
  readonly prepareGreenfieldCallBudget: (settings: ProviderSettings) => void;
  readonly prepareMultiPhaseGreenfieldCallBudget: (
    settings: ProviderSettings,
    pageCount?: number,
  ) => void;
  readonly canMakeAiCall: (
    settings: ProviderSettings,
    purpose: import("@/core/providers/costControls").AiCallGatePurpose,
    stage?: import("@/core/providers/orchestration").AgentStage,
  ) => { readonly ok: boolean; readonly reason?: string };
  readonly providerInvokeStopRef: import("react").RefObject<string | null>;
  readonly providerRequestSentRef: import("react").RefObject<boolean>;
  /** Provider reliability wrapper for repair/auto-fix calls. */
  invokeRepairCall: <T extends import("@/core/providers/stageInvoke").StageProviderResult>(
    settings: ProviderSettings,
    estimatedTokens: number,
    call: (provider: ProviderId) => Promise<T>,
  ) => Promise<T | null>;
  /** Open the Providers panel from the title bar pill. */
  openProvidersView(): void;
  /** Active Insights sub-tab (dashboard, git, etc.). */
  readonly insightsTab: InsightsTab;
  setInsightsTab(tab: InsightsTab): void;
  /** Open Insights → Git from the title bar badge. */
  openGitPanel(): void;
  /** Phase 23 — per-project run analytics (local, capped at 500). */
  readonly analyticsHistory: readonly StudioAnalyticsRecord[];
  readonly selectedAnalyticsId: string | null;
  selectAnalyticsRecord(id: string | null): void;
  openAnalyticsFromDashboard(recordId: string): void;
  // ---- Git panel ----
  readonly gitStatus: import("@/core/git/types").GitStatusSnapshot | null;
  readonly gitStatusLoading: boolean;
  readonly gitActionError: string | null;
  readonly selectedGitPath: string | null;
  readonly gitDiff: import("@/core/git/types").GitDiffContents | null;
  readonly gitDiffLoading: boolean;
  readonly gitDiffError: string | null;
  refreshGitStatus(): Promise<void>;
  gitStage(paths: string[]): Promise<import("@/core/git/types").GitActionResult>;
  gitUnstage(paths: string[]): Promise<import("@/core/git/types").GitActionResult>;
  gitRestore(paths: string[]): Promise<import("@/core/git/types").GitActionResult>;
  gitCommit(
    message: string,
  ): Promise<import("@/core/git/types").GitCommitResult>;
  selectGitPath(relPath: string | null): void;
  // ---- Run persistence (resume after restart) ----
  readonly pendingRunCheckpoint: PersistedRunCheckpoint | null;
  resumePersistedRun(): Promise<void>;
  abandonPersistedRun(): void;
}
