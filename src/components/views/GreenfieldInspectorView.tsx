import { useEffect, useMemo } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { useEffectiveGreenfieldRun } from "@/app/workspace/useEffectiveGreenfieldRun";
import { useAgentRunViewModel } from "@/app/workspace/useAgentRunViewModel";
import { useSelectedAgentArtifact } from "@/app/workspace/useSelectedAgentArtifact";
import { findAgentRunArtifact } from "@/core/agent/agentRunHistory";
import { greenfieldSnapshotFromArtifact } from "@/core/agent/artifactObservability";
import {
  buildRunInspectorExport,
  buildRunInspectorViewModel,
  exportRunInspectorJson,
  exportRunInspectorTxt,
} from "@/core/agent/runInspector";
import {
  isInspectorRunListed,
  resolveInspectorLockedRunId,
} from "@/core/agent/runInspectorSession";
import { HistoricalRunBanner } from "@/components/views/HistoricalRunBanner";
import { RunInspectorPanel } from "@/components/views/RunInspectorPanel";

/**
 * Center Inspector tab — advanced artifact inspection (trace, diffs, metrics).
 * Live run log is on the Studio Log workbench tab.
 */
export function GreenfieldInspectorView() {
  const {
    selectAgentRun,
    agentRunHistory,
    activeAgentRunId,
    inspectorSession,
    setInspectorTab,
    setCenterInspectorActive,
    aiPlan,
    planApplySession,
  } = useWorkspace();
  const { agentRunCard } = useAgentRunViewModel();
  const { snapshot: greenfieldRun, viewingHistorical, selectedArtifact } =
    useEffectiveGreenfieldRun();
  const artifactFromSelection = useSelectedAgentArtifact();

  const artifact = selectedArtifact ?? artifactFromSelection;
  const fallbackRunId =
    artifact?.runId ?? activeAgentRunId ?? greenfieldRun.runTimeline?.runId ?? null;

  useEffect(() => {
    setCenterInspectorActive(fallbackRunId);
  }, [fallbackRunId, setCenterInspectorActive]);

  const runId = resolveInspectorLockedRunId(inspectorSession, fallbackRunId);
  const runListed =
    runId != null &&
    isInspectorRunListed(runId, {
      activeAgentRunId,
      historyRunIds: agentRunHistory.map((run) => run.runId),
    });

  const model = useMemo(() => {
    if (!runId) {
      return buildRunInspectorViewModel({
        runId: "pending",
        prompt: "",
        greenfieldRun,
        card: agentRunCard,
      });
    }
    const historical = artifact ?? findAgentRunArtifact(agentRunHistory, runId);
    const isLive = activeAgentRunId === runId;
    const snapshot = isLive
      ? greenfieldRun
      : historical
        ? greenfieldSnapshotFromArtifact(historical)
        : greenfieldRun;
    return buildRunInspectorViewModel({
      runId,
      runNumber: historical?.runNumber ?? null,
      prompt: historical?.prompt ?? greenfieldRun.workflow?.prompt ?? "",
      outcome: historical?.outcome ?? null,
      route: historical?.timeline?.route ?? greenfieldRun.runTimeline?.route ?? null,
      greenfieldRun: snapshot,
      card: historical?.card ?? (isLive ? agentRunCard : null),
      artifact: historical,
      aiPlan,
      planApplySession,
      durationMs: historical?.durationMs ?? greenfieldRun.durationMs,
      provider: historical?.provider ?? greenfieldRun.provider,
      model: historical?.model ?? greenfieldRun.model,
      startedAt: historical?.startedAt ?? greenfieldRun.runStartedAt,
      endedAt: historical?.endedAt ?? greenfieldRun.endedAt,
    });
  }, [agentRunCard, agentRunHistory, artifact, aiPlan, planApplySession, greenfieldRun, runId, activeAgentRunId]);

  const exportBundle = useMemo(() => buildRunInspectorExport(model), [model]);

  return (
    <div className="gf-inspector-center gf-inspector-center--panel-only">
      {viewingHistorical && selectedArtifact ? (
        <HistoricalRunBanner
          artifact={selectedArtifact}
          onBackToLive={() => selectAgentRun(null)}
        />
      ) : null}
      {runId && !runListed ? (
        <p className="center-panel__hint run-inspector__unavailable" role="status">
          Run no longer available.
        </p>
      ) : null}
      <div className="gf-inspector-center__toolbar">
        <button type="button" className="prov-btn prov-btn--sm" onClick={() => exportRunInspectorTxt(exportBundle)}>
          Export .txt
        </button>
        <button type="button" className="prov-btn prov-btn--sm" onClick={() => exportRunInspectorJson(exportBundle)}>
          Export .json
        </button>
      </div>
      <RunInspectorPanel
        model={model}
        tab={inspectorSession.tab}
        onTabChange={setInspectorTab}
        preserveScroll
      />
    </div>
  );
}
