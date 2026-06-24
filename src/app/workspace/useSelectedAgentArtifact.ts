import { useMemo } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import {
  findAgentRunArtifact,
  type AgentRunArtifact,
} from "@/core/agent/agentRunHistory";

export function useSelectedAgentArtifact(): AgentRunArtifact | null {
  const { selectedAgentRunId, agentRunHistory } = useWorkspace();

  return useMemo(
    () => findAgentRunArtifact(agentRunHistory, selectedAgentRunId),
    [agentRunHistory, selectedAgentRunId],
  );
}
