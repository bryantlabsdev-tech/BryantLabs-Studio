import { useMemo } from "react";
import { useWorkspace } from "@/app/workspaceContext";
import { useEffectiveGreenfieldRun } from "@/app/workspace/useEffectiveGreenfieldRun";
import { PipelineInspectorPanel } from "@/components/views/PipelineInspectorPanel";

/**
 * Center workbench tab — per-stage pipeline diagnostics for the active run.
 */
export function PipelineInspectorView() {
  const { planApplySession } = useWorkspace();
  const { snapshot: greenfieldRun } = useEffectiveGreenfieldRun();

  const runKey = useMemo(
    () =>
      `${greenfieldRun.runStartedAt ?? "idle"}:${greenfieldRun.entries.length}:${greenfieldRun.runResult}`,
    [greenfieldRun.entries.length, greenfieldRun.runResult, greenfieldRun.runStartedAt],
  );

  return (
    <div className="pipeline-inspector-view" key={runKey}>
      <PipelineInspectorPanel
        greenfieldRun={greenfieldRun}
        planApplySession={planApplySession}
      />
    </div>
  );
}
