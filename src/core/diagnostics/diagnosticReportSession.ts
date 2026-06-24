import type { DiagnosticReportBundle } from "@/core/diagnostics/diagnosticReport";

export interface DiagnosticReportMetadata {
  readonly runId: string;
  readonly previousRunId: string | null;
  readonly prompt: string;
  readonly projectPath: string | null;
  readonly route: string | null;
  readonly generationMode: string | null;
}

export interface DiagnosticReportSession {
  readonly modalOpen: boolean;
  readonly runId: string | null;
  readonly bundle: DiagnosticReportBundle | null;
  readonly metadata: DiagnosticReportMetadata | null;
}

export const EMPTY_DIAGNOSTIC_REPORT_SESSION: DiagnosticReportSession = {
  modalOpen: false,
  runId: null,
  bundle: null,
  metadata: null,
};

export type DiagnosticReportSessionAction =
  | {
      readonly type: "open_modal";
      readonly runId: string;
      readonly bundle: DiagnosticReportBundle;
      readonly metadata: DiagnosticReportMetadata;
    }
  | { readonly type: "close_modal" };

export function reduceDiagnosticReportSession(
  state: DiagnosticReportSession,
  action: DiagnosticReportSessionAction,
): DiagnosticReportSession {
  switch (action.type) {
    case "open_modal":
      if (state.modalOpen && state.runId === action.runId) {
        return state;
      }
      return {
        modalOpen: true,
        runId: action.runId,
        bundle: action.bundle,
        metadata: action.metadata,
      };
    case "close_modal":
      return EMPTY_DIAGNOSTIC_REPORT_SESSION;
    default:
      return state;
  }
}

export function isDiagnosticReportOpenForRun(
  session: DiagnosticReportSession,
  runId: string | null,
): boolean {
  return Boolean(session.modalOpen && runId && session.runId === runId);
}
