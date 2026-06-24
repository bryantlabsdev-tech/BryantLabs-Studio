import { useMemo, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { useEffectiveGreenfieldRun } from "@/app/workspace/useEffectiveGreenfieldRun";
import { HistoricalRunBanner } from "@/components/views/HistoricalRunBanner";
import { StudioRunLogInspector } from "@/components/views/StudioRunLogInspector";
import {
  buildStudioRunSummary,
  formatStudioDebugReport,
  formatStudioTelemetryLog,
} from "@/core/studioRun/summary";

export function GreenfieldLogsView() {
  const { selectAgentRun } = useWorkspace();
  const { snapshot: greenfieldRun, viewingHistorical, selectedArtifact } =
    useEffectiveGreenfieldRun();
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const summary = useMemo(
    () => buildStudioRunSummary(greenfieldRun),
    [greenfieldRun],
  );

  const copyLog = async () => {
    const text = formatStudioTelemetryLog({
      entries: greenfieldRun.entries,
      generationMetrics: greenfieldRun.generationMetrics,
      debugReport: greenfieldRun.debug,
      summary,
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopyNote("Copied log");
    } catch {
      setCopyNote("Copy failed");
    }
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  const copyDebug = async () => {
    const text = formatStudioDebugReport({
      entries: greenfieldRun.entries,
      summary,
      ...(greenfieldRun.debug ? { debugReport: greenfieldRun.debug } : {}),
    });
    try {
      await navigator.clipboard.writeText(text);
      setCopyNote("Copied debug report");
    } catch {
      setCopyNote("Copy failed");
    }
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  return (
    <StudioRunLogInspector
      title="Studio Run Log"
      entries={greenfieldRun.entries}
      snapshot={greenfieldRun}
      summary={summary}
      autoScroll={summary.runResult === "running" || greenfieldRun.runResult === "running"}
      onCopyLogs={() => void copyLog()}
      onCopyDebug={() => void copyDebug()}
      copyNote={copyNote}
      banner={
        viewingHistorical && selectedArtifact ? (
          <HistoricalRunBanner
            artifact={selectedArtifact}
            onBackToLive={() => selectAgentRun(null)}
          />
        ) : null
      }
    />
  );
}
