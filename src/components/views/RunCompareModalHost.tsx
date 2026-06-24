import { useEffect } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { RunCompareModal } from "@/components/views/RunCompareModal";

export function RunCompareModalHost() {
  const { compareSession, agentRunHistory, projectIntelligence, closeRunCompare } = useWorkspace();

  const isOpen = compareSession.open && compareSession.runIds != null;

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeRunCompare();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, closeRunCompare]);

  if (!isOpen || !compareSession.runIds) return null;

  return (
    <RunCompareModal
      leftRunId={compareSession.runIds[0]}
      rightRunId={compareSession.runIds[1]}
      history={agentRunHistory}
      projectIntelligence={projectIntelligence}
      onClose={closeRunCompare}
    />
  );
}
