import { useMemo } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { useAgentRunViewModel } from "@/app/workspace/useAgentRunViewModel";
import { findAgentRunArtifact } from "@/core/agent/agentRunHistory";
import { extractRunFileDiffs, resolveAllowGeneratedFileDiffs } from "@/core/agent/runFileDiffs";

export function useLiveRunDiffs(): ReturnType<typeof extractRunFileDiffs> {
  const {
    activeAgentRunId,
    selectedAgentRunId,
    planApplySession,
    agentRunHistory,
    greenfieldRun,
  } = useWorkspace();
  const { agentRunCard } = useAgentRunViewModel();

  return useMemo(() => {
    if (!activeAgentRunId) return [];
    if (selectedAgentRunId && selectedAgentRunId !== activeAgentRunId) return [];
    if (findAgentRunArtifact(agentRunHistory, activeAgentRunId)) return [];
    return extractRunFileDiffs({
      card: agentRunCard,
      planApplySession,
      generatedFiles: greenfieldRun.generatedFiles,
      appliedFileDiffs: greenfieldRun.appliedFileDiffs,
      allowGeneratedFiles: resolveAllowGeneratedFileDiffs(greenfieldRun),
    });
  }, [
    activeAgentRunId,
    selectedAgentRunId,
    agentRunHistory,
    agentRunCard,
    planApplySession,
    greenfieldRun.generatedFiles,
    greenfieldRun.appliedFileDiffs,
  ]);
}
