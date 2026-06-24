import { useEffect } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { DiagnosticReportModal } from "@/components/views/DiagnosticReportModal";

/**
 * Stable diagnostic report modal host — survives chat card re-renders during live runs.
 */
export function DiagnosticReportModalHost() {
  const { diagnosticReportSession, closeDiagnosticReport } = useWorkspace();

  const isOpen = diagnosticReportSession.modalOpen && diagnosticReportSession.bundle != null;

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeDiagnosticReport();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closeDiagnosticReport]);

  if (!isOpen || !diagnosticReportSession.bundle) return null;

  return (
    <DiagnosticReportModal
      bundle={diagnosticReportSession.bundle}
      onClose={closeDiagnosticReport}
    />
  );
}
