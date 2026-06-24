import { useMemo, useState } from "react";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import type { RunInspectorTab } from "@/core/agent/runInspector";
import {
  buildRunInspectorExport,
  buildRunInspectorViewModel,
  copyRunInspectorText,
  exportRunInspectorJson,
  exportRunInspectorTxt,
} from "@/core/agent/runInspector";
import type { RunTerminalOutcome } from "@/core/agent/runTerminal";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { RunInspectorPanel } from "@/components/views/RunInspectorPanel";

export interface RunInspectorModalProps {
  readonly runId: string;
  readonly runNumber?: number | null;
  readonly prompt: string;
  readonly outcome?: RunTerminalOutcome | null;
  readonly route?: string | null;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly card?: AgentRunCardViewModel | null;
  readonly artifact?: AgentRunArtifact | null;
  readonly aiPlan?: import("@/core/planner/aiTypes").AIPlanResult | null;
  readonly tab: RunInspectorTab;
  readonly onTabChange: (tab: RunInspectorTab) => void;
  readonly runUnavailable?: boolean;
  readonly onClose: () => void;
}

export function RunInspectorModal({
  runId,
  runNumber = null,
  prompt,
  outcome = null,
  route = null,
  greenfieldRun,
  card = null,
  artifact = null,
  aiPlan = null,
  tab,
  onTabChange,
  runUnavailable = false,
  onClose,
}: RunInspectorModalProps) {
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const model = useMemo(
    () =>
      buildRunInspectorViewModel({
        runId,
        runNumber,
        prompt,
        outcome,
        route,
        greenfieldRun,
        card,
        artifact,
        aiPlan,
        durationMs: artifact?.durationMs ?? greenfieldRun.durationMs,
        provider: artifact?.provider ?? greenfieldRun.provider,
        model: artifact?.model ?? greenfieldRun.model,
        startedAt: artifact?.startedAt ?? greenfieldRun.runStartedAt,
        endedAt: artifact?.endedAt ?? greenfieldRun.endedAt,
      }),
    [
      aiPlan,
      artifact,
      card,
      greenfieldRun,
      outcome,
      prompt,
      route,
      runId,
      runNumber,
    ],
  );

  const exportBundle = useMemo(() => buildRunInspectorExport(model), [model]);

  const handleCopy = async () => {
    const ok = await copyRunInspectorText(exportBundle.text);
    setCopyNote(ok ? "Copied" : "Copy failed");
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  return (
    <div className="diagnostic-modal__backdrop" role="presentation" onClick={onClose}>
      <div
        className="diagnostic-modal run-inspector-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="run-inspector-title"
        data-testid="run-inspector-modal"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="diagnostic-modal__head">
          <h3 id="run-inspector-title">Run Inspector</h3>
          <button type="button" className="diagnostic-modal__close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </header>

        <div className="diagnostic-modal__actions">
          <button type="button" className="prov-btn" onClick={() => void handleCopy()}>
            Copy report
          </button>
          <button type="button" className="prov-btn" onClick={() => exportRunInspectorTxt(exportBundle)}>
            Export .txt
          </button>
          <button type="button" className="prov-btn" onClick={() => exportRunInspectorJson(exportBundle)}>
            Export .json
          </button>
          {copyNote ? <span className="diagnostic-modal__copynote">{copyNote}</span> : null}
        </div>

        <div className="run-inspector-modal__body">
          {runUnavailable ? (
            <p className="center-panel__hint run-inspector__unavailable" role="status">
              Run no longer available.
            </p>
          ) : null}
          <RunInspectorPanel model={model} tab={tab} onTabChange={onTabChange} preserveScroll />
        </div>
      </div>
    </div>
  );
}
