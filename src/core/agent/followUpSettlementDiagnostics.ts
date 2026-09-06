export interface IncompleteCoordinationDiagnostic {
  readonly incomplete: boolean;
  readonly missing: readonly string[];
}

/** Lengths and IDs only — never prompt text or source contents. */
export interface FollowUpSettlementDiagnostic {
  readonly projectPath: string | null;
  readonly indexedSourceFileCount: number;
  readonly createPromptLength: number | null;
  readonly followUpPromptLength: number | null;
  readonly submitEventId: string | null;
  readonly activeRunId: string | null;
  readonly greenfieldRunId: string | null;
  readonly greenfieldStatus: string | null;
  readonly currentActionType: string | null;
  readonly selectedRoutingDecision: string | null;
  readonly routingReason: string | null;
  readonly scanStatus: string | null;
  readonly effectiveProjectScanSourceCount: number;
  readonly projectFilesExistOnDisk: boolean;
  readonly generateInvocations: number;
  readonly applyPlanInvocations: number;
  readonly proposalCount: number;
  readonly proposalsReady: number;
  readonly incompleteCoordination: IncompleteCoordinationDiagnostic | null;
  readonly terminalRunState: string | null;
}

const emptyDiagnostic = (): FollowUpSettlementDiagnostic => ({
  projectPath: null,
  indexedSourceFileCount: 0,
  createPromptLength: null,
  followUpPromptLength: null,
  submitEventId: null,
  activeRunId: null,
  greenfieldRunId: null,
  greenfieldStatus: null,
  currentActionType: null,
  selectedRoutingDecision: null,
  routingReason: null,
  scanStatus: null,
  effectiveProjectScanSourceCount: 0,
  projectFilesExistOnDisk: false,
  generateInvocations: 0,
  applyPlanInvocations: 0,
  proposalCount: 0,
  proposalsReady: 0,
  incompleteCoordination: null,
  terminalRunState: null,
});

let diagnostic: FollowUpSettlementDiagnostic = emptyDiagnostic();

export function resetFollowUpSettlementDiagnostic(): void {
  diagnostic = emptyDiagnostic();
}

export function getFollowUpSettlementDiagnostic(): FollowUpSettlementDiagnostic {
  return diagnostic;
}

export function patchFollowUpSettlementDiagnostic(
  patch: Partial<FollowUpSettlementDiagnostic>,
): FollowUpSettlementDiagnostic {
  diagnostic = { ...diagnostic, ...patch };
  return diagnostic;
}

export function incrementGenerateInvocations(): number {
  diagnostic = {
    ...diagnostic,
    generateInvocations: diagnostic.generateInvocations + 1,
  };
  return diagnostic.generateInvocations;
}

export function incrementApplyPlanInvocations(): number {
  diagnostic = {
    ...diagnostic,
    applyPlanInvocations: diagnostic.applyPlanInvocations + 1,
  };
  return diagnostic.applyPlanInvocations;
}

export function recordSubmitRoutingDiagnostic(input: {
  readonly projectPath: string | null;
  readonly indexedSourceFileCount: number;
  readonly promptLength: number;
  readonly isFollowUp: boolean;
  readonly submitEventId: string;
  readonly activeRunId: string | null;
  readonly greenfieldStatus: string | null;
  readonly currentActionType: string | null;
  readonly selectedRoutingDecision: string | null;
  readonly routingReason: string | null;
  readonly scanStatus: string | null;
  readonly effectiveProjectScanSourceCount: number;
  readonly projectFilesExistOnDisk: boolean;
}): FollowUpSettlementDiagnostic {
  return patchFollowUpSettlementDiagnostic({
    projectPath: input.projectPath,
    indexedSourceFileCount: input.indexedSourceFileCount,
    createPromptLength: input.isFollowUp
      ? diagnostic.createPromptLength
      : input.promptLength,
    followUpPromptLength: input.isFollowUp
      ? input.promptLength
      : diagnostic.followUpPromptLength,
    submitEventId: input.submitEventId,
    activeRunId: input.activeRunId,
    greenfieldStatus: input.greenfieldStatus,
    currentActionType: input.currentActionType,
    selectedRoutingDecision: input.selectedRoutingDecision,
    routingReason: input.routingReason,
    scanStatus: input.scanStatus,
    effectiveProjectScanSourceCount: input.effectiveProjectScanSourceCount,
    projectFilesExistOnDisk: input.projectFilesExistOnDisk,
  });
}
