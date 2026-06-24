import { useMemo } from "react";
import {
  diffableFilesFromRunDiffs,
  resolveSelectedDiffPath,
} from "@/core/agent/artifactDiffView";
import type { RunFileDiff } from "@/core/agent/runFileDiffs";
import { RunDiffWorkbenchView } from "@/components/views/RunDiffWorkbenchView";
import { useWorkspace } from "@/app/WorkspaceProvider";

interface LiveRunDiffViewProps {
  readonly diffs: readonly RunFileDiff[];
}

export function LiveRunDiffView({ diffs }: LiveRunDiffViewProps) {
  const { selectedArtifactDiffPath, focusArtifactDiff } = useWorkspace();
  const files = useMemo(() => diffableFilesFromRunDiffs(diffs), [diffs]);
  const selectedPath = useMemo(
    () => resolveSelectedDiffPath(files, selectedArtifactDiffPath),
    [files, selectedArtifactDiffPath],
  );

  return (
    <RunDiffWorkbenchView
      files={files}
      selectedPath={selectedPath}
      onSelectPath={(path) => focusArtifactDiff({ path })}
      testId="live-run-diff-view"
      emptyHint="No file changes yet for this run."
      header={
        <div className="historical-run-banner" data-testid="live-run-diff-banner">
          <p className="historical-run-banner__text">
            Live run — diffs update as the agent works.
          </p>
        </div>
      }
    />
  );
}
