import type { MouseEvent } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";

interface RunInspectorActionsProps {
  readonly runId: string | null;
  readonly compact?: boolean;
}

export function RunInspectorActions({
  runId,
  compact = false,
}: RunInspectorActionsProps) {
  const { openRunInspector, inspectorSession } = useWorkspace();

  if (!runId) return null;

  const isOpenForRun = inspectorSession.modalOpen && inspectorSession.lockedRunId === runId;

  const handleOpen = (event: MouseEvent) => {
    event.stopPropagation();
    openRunInspector(runId);
  };

  return (
    <button
      type="button"
      className={`prov-btn${compact ? " prov-btn--compact" : ""}${isOpenForRun ? " prov-btn--active" : ""}`}
      data-testid="run-inspector-open"
      aria-pressed={isOpenForRun}
      onClick={handleOpen}
    >
      Inspect Run
    </button>
  );
}
