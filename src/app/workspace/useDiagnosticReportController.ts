import { useCallback, useMemo, useState } from "react";
import type { DiagnosticReportBundle } from "@/core/diagnostics/diagnosticReport";
import {
  EMPTY_DIAGNOSTIC_REPORT_SESSION,
  reduceDiagnosticReportSession,
  type DiagnosticReportMetadata,
  type DiagnosticReportSession,
} from "@/core/diagnostics/diagnosticReportSession";

export interface OpenDiagnosticReportInput {
  readonly runId: string;
  readonly bundle: DiagnosticReportBundle;
  readonly metadata: DiagnosticReportMetadata;
}

export function useDiagnosticReportController() {
  const [session, setSession] = useState<DiagnosticReportSession>(
    EMPTY_DIAGNOSTIC_REPORT_SESSION,
  );

  const openDiagnosticReport = useCallback((input: OpenDiagnosticReportInput) => {
    setSession((prev) =>
      reduceDiagnosticReportSession(prev, {
        type: "open_modal",
        runId: input.runId,
        bundle: input.bundle,
        metadata: input.metadata,
      }),
    );
  }, []);

  const closeDiagnosticReport = useCallback(() => {
    setSession((prev) => reduceDiagnosticReportSession(prev, { type: "close_modal" }));
  }, []);

  return useMemo(
    () => ({
      diagnosticReportSession: session,
      openDiagnosticReport,
      closeDiagnosticReport,
    }),
    [session, openDiagnosticReport, closeDiagnosticReport],
  );
}
