import { useMemo } from "react";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import {
  diffableFilesFromArtifact,
  resolveSelectedDiffPath,
} from "@/core/agent/artifactDiffView";
import { HistoricalRunBanner } from "@/components/views/HistoricalRunBanner";
import { RunDiffWorkbenchView } from "@/components/views/RunDiffWorkbenchView";
import { useWorkspace } from "@/app/WorkspaceProvider";

interface ArtifactDiffViewProps {
  readonly artifact: AgentRunArtifact;
}

export function ArtifactDiffView({ artifact }: ArtifactDiffViewProps) {
  const { selectAgentRun, selectedArtifactDiffPath, focusArtifactDiff } = useWorkspace();
  const files = useMemo(() => diffableFilesFromArtifact(artifact), [artifact]);

  const selectedPath = useMemo(
    () => resolveSelectedDiffPath(files, selectedArtifactDiffPath),
    [files, selectedArtifactDiffPath],
  );

  return (
    <RunDiffWorkbenchView
      files={files}
      selectedPath={selectedPath}
      onSelectPath={(path) => focusArtifactDiff({ path })}
      testId="artifact-diff-view"
      header={
        <HistoricalRunBanner
          artifact={artifact}
          onBackToLive={() => selectAgentRun(null)}
        />
      }
    />
  );
}
