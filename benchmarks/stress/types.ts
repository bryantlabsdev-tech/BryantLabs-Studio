export type StressSuiteId = "full" | "fast" | "single";

export type StressFailureClass =
  | "missing_required_type_fields"
  | "bad_imports"
  | "unused_imports_types"
  | "router_layout_errors"
  | "localstorage_shape_mismatch"
  | "invalid_jsx"
  | "missing_files"
  | "broken_crud_flow"
  | "broken_chart_data_dependency"
  | "build_config_issue"
  | "timeout"
  | "repair_exhausted"
  | "ui_audit_failure"
  | "generation_failed"
  | "unknown";

export type StressFinalStatus = "success" | "failed" | "timeout" | "skipped";

export type StressGateResult = "passed" | "failed" | "advisory" | "skipped" | "not_run";

export type RuntimeSmokeOverallStatus = "passed" | "advisory" | "failed";

export interface RuntimeSmokeSummary {
  readonly ok: boolean;
  readonly overallStatus: RuntimeSmokeOverallStatus;
  readonly appType: string;
  readonly failedChecks: readonly string[];
  readonly advisoryChecks: readonly string[];
}

export interface StressRepairAttempt {
  readonly attempt: number;
  readonly kind: "deterministic" | "llm";
  readonly targetPath: string;
  readonly outcome: "applied" | "failed" | "skipped";
  readonly detail: string;
  readonly estimatedInputTokens?: number;
  readonly estimatedOutputTokens?: number;
}

export interface StressImprovementSuggestion {
  readonly rootCause: string;
  readonly file: string;
  readonly line: number | null;
  readonly column: number | null;
  readonly whyRepairFailed: string | null;
  readonly deterministicRepairCandidate: string | null;
  readonly llmRepairNecessary: boolean;
  readonly recommendedStudioFix: string;
}

export interface StressRunMetrics {
  readonly promptId: string;
  readonly promptName: string;
  readonly targetFolder: string;
  readonly provider: string;
  readonly model: string;
  readonly durationMs: number;
  readonly filesGenerated: number;
  readonly typescript: StressGateResult;
  readonly build: StressGateResult;
  readonly preview: StressGateResult;
  readonly uiAudit: StressGateResult;
  readonly runtimeSmoke: StressGateResult;
  readonly runtimeSmokeDetails: RuntimeSmokeSummary | null;
  readonly repairAttempts: readonly StressRepairAttempt[];
  readonly repairTokenUsage: {
    readonly deterministicPasses: number;
    readonly llmAttempts: number;
    readonly estimatedInputTokens: number;
    readonly estimatedOutputTokens: number;
  };
  readonly repairFailureReason: string | null;
  readonly failureClass: StressFailureClass | null;
  readonly finalStatus: StressFinalStatus;
  readonly primaryErrorLine: string | null;
  readonly suggestions: readonly StressImprovementSuggestion[];
  readonly fixNeeded: string | null;
}

export interface StressSuiteResult {
  readonly version: 1;
  readonly mode: "dry-run" | "live";
  readonly startedAt: string;
  readonly finishedAt: string;
  readonly durationMs: number;
  readonly provider: string;
  readonly model: string;
  readonly runs: readonly StressRunMetrics[];
  readonly successRate: number;
  readonly averageDurationMs: number;
  readonly averageRepairAttempts: number;
  readonly topFailureClasses: readonly { readonly class: StressFailureClass; readonly count: number }[];
  readonly topDeterministicOpportunities: readonly {
    readonly label: string;
    readonly count: number;
  }[];
  readonly estimatedScoreChange: number;
  readonly suiteId?: StressSuiteId;
  readonly suiteTarget?: {
    readonly promptCount: number;
    readonly passTarget: number;
    readonly successRateTarget: number;
  };
  /** Where live generation wrote project folders (`stress/live/`). */
  readonly liveOutputRoot?: string;
  /** Independent frozen-corpus replay health (not live-failure recovery). */
  readonly frozenReplay?: {
    readonly corpusRoot: string;
    readonly typecheckPassCount: number;
    readonly buildPassCount: number;
    readonly passTarget: number;
    readonly targetMet: boolean;
    readonly projects: readonly {
      readonly id: string;
      readonly typecheckOk: boolean;
      readonly buildOk: boolean;
      readonly deterministicPasses: number;
      readonly repairAttempts: number;
    }[];
  };
  /** @deprecated Misleading when live overwrote replay corpus — use {@link frozenReplay}. */
  readonly replayGeneralization?: {
    readonly liveFailedCount: number;
    readonly replayRecoveredCount: number;
    readonly projects: readonly {
      readonly id: string;
      readonly liveStatus: StressFinalStatus;
      readonly replayTypecheckOk: boolean;
      readonly replayBuildOk: boolean;
      readonly deterministicPasses: number;
      readonly repairAttempts: number;
    }[];
  };
}

export interface StressPromptDefinition {
  readonly id: string;
  readonly name: string;
  readonly appName: string;
  readonly minPages: number;
  readonly prompt: string;
  readonly expectedKeywords: readonly string[];
}
