import type { MouseEvent } from "react";
import { useMemo, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import {
  copyDiagnosticReportText,
  resolveDiagnosticReportBundle,
} from "@/core/diagnostics/diagnosticReport";
import { isDiagnosticReportOpenForRun } from "@/core/diagnostics/diagnosticReportSession";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { RunTerminalOutcome } from "@/core/agent/runTerminal";

interface DiagnosticReportActionsProps {
  readonly runId: string | null;
  readonly previousRunId?: string | null;
  readonly prompt: string;
  readonly card: AgentRunCardViewModel;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly artifact?: AgentRunArtifact | null;
  readonly outcome?: RunTerminalOutcome | null;
  readonly projectPath?: string | null;
  readonly route?: string | null;
  readonly generationMode?: string | null;
  readonly compact?: boolean;
}

export function DiagnosticReportActions({
  runId,
  previousRunId = null,
  prompt,
  card,
  greenfieldRun,
  artifact = null,
  outcome = null,
  projectPath = null,
  route = null,
  generationMode = null,
  compact = false,
}: DiagnosticReportActionsProps) {
  const { diagnosticReportSession, openDiagnosticReport } = useWorkspace();
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const bundle = useMemo(
    () =>
      resolveDiagnosticReportBundle({
        runId,
        previousRunId,
        prompt,
        card,
        greenfieldRun,
        artifact,
        outcome: outcome ?? artifact?.outcome ?? null,
        projectPath,
        route,
        generationMode,
      }),
    [
      artifact,
      card,
      generationMode,
      greenfieldRun,
      outcome,
      previousRunId,
      projectPath,
      prompt,
      route,
      runId,
    ],
  );

  if (!bundle || !runId) return null;

  const isOpenForRun = isDiagnosticReportOpenForRun(diagnosticReportSession, runId);

  const handleCopy = async (event: MouseEvent) => {
    event.stopPropagation();
    const ok = await copyDiagnosticReportText(bundle.text);
    setCopyNote(ok ? "Copied" : "Copy failed");
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  const handleOpen = (event: MouseEvent) => {
    event.stopPropagation();
    openDiagnosticReport({
      runId,
      bundle,
      metadata: {
        runId,
        previousRunId,
        prompt,
        projectPath,
        route,
        generationMode,
      },
    });
  };

  return (
    <div
      className={`diagnostic-actions${compact ? " diagnostic-actions--compact" : ""}`}
      data-testid="diagnostic-report-actions"
    >
      <button type="button" className="prov-btn" onClick={(event) => void handleCopy(event)}>
        Copy Diagnostic Report
      </button>
      <button
        type="button"
        className={`prov-btn${isOpenForRun ? " prov-btn--active" : ""}`}
        aria-pressed={isOpenForRun}
        onClick={handleOpen}
      >
        Open Diagnostics
      </button>
      {copyNote ? <span className="diagnostic-actions__note">{copyNote}</span> : null}
    </div>
  );
}
