import { useMemo } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { useSelectedAgentArtifact } from "@/app/workspace/useSelectedAgentArtifact";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { greenfieldSnapshotFromArtifact } from "@/core/agent/artifactObservability";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";

export interface EffectiveGreenfieldRun {
  readonly snapshot: GreenfieldRunSnapshot;
  readonly viewingHistorical: boolean;
  readonly selectedArtifact: AgentRunArtifact | null;
}

export function useEffectiveGreenfieldRun(): EffectiveGreenfieldRun {
  const { greenfieldRun } = useWorkspace();
  const selectedArtifact = useSelectedAgentArtifact();

  return useMemo(() => {
    if (selectedArtifact) {
      return {
        snapshot: greenfieldSnapshotFromArtifact(selectedArtifact),
        viewingHistorical: true,
        selectedArtifact,
      };
    }
    return {
      snapshot: greenfieldRun,
      viewingHistorical: false,
      selectedArtifact: null,
    };
  }, [greenfieldRun, selectedArtifact]);
}
