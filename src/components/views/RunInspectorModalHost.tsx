import { useEffect, useMemo } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { useAgentRunViewModel } from "@/app/workspace/useAgentRunViewModel";
import { findAgentRunArtifact } from "@/core/agent/agentRunHistory";
import { greenfieldSnapshotFromArtifact } from "@/core/agent/artifactObservability";
import {
  isInspectorRunListed,
} from "@/core/agent/runInspectorSession";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import { RunInspectorModal } from "@/components/views/RunInspectorModal";

/**
 * Stable modal host — survives chat card re-renders during live runs.
 */
export function RunInspectorModalHost() {
  const {
    inspectorSession,
    closeRunInspector,
    setInspectorTab,
    greenfieldRun,
    agentRunHistory,
    activeAgentRunId,
    aiPlan,
  } = useWorkspace();
  const { agentRunCard } = useAgentRunViewModel({
    selectedAgentRunId: null,
  });

  const lockedRunId = inspectorSession.lockedRunId;
  const isOpen = inspectorSession.modalOpen && lockedRunId != null;

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRunInspector();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closeRunInspector]);

  const resolved = useMemo(() => {
    if (!lockedRunId) return null;
    const artifact = findAgentRunArtifact(agentRunHistory, lockedRunId);
    const isLive = activeAgentRunId === lockedRunId;
    const runListed = isInspectorRunListed(lockedRunId, {
      activeAgentRunId,
      historyRunIds: agentRunHistory.map((run) => run.runId),
    });
    const snapshot: GreenfieldRunSnapshot = isLive
      ? greenfieldRun
      : artifact
        ? greenfieldSnapshotFromArtifact(artifact)
        : greenfieldRun;

    return {
      runId: lockedRunId,
      artifact,
      isLive,
      runListed,
      snapshot,
      prompt:
        artifact?.prompt ??
        greenfieldRun.workflow?.prompt ??
        "",
      card: artifact?.card ?? (isLive ? agentRunCard : null),
      outcome: artifact?.outcome ?? null,
      route: artifact?.timeline?.route ?? greenfieldRun.runTimeline?.route ?? null,
      runNumber: artifact?.runNumber ?? null,
    };
  }, [
    lockedRunId,
    agentRunHistory,
    activeAgentRunId,
    greenfieldRun,
    agentRunCard,
  ]);

  if (!isOpen || !resolved) return null;

  return (
    <RunInspectorModal
      runId={resolved.runId}
      runNumber={resolved.runNumber}
      prompt={resolved.prompt}
      outcome={resolved.outcome}
      route={resolved.route}
      greenfieldRun={resolved.snapshot}
      artifact={resolved.artifact}
      card={resolved.card}
      aiPlan={aiPlan}
      tab={inspectorSession.tab}
      onTabChange={setInspectorTab}
      runUnavailable={!resolved.runListed}
      onClose={closeRunInspector}
    />
  );
}
