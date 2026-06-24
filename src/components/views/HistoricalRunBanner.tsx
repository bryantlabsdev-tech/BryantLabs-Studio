import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { formatGreenfieldElapsed } from "@/core/agent/greenfieldRunProgress";

interface HistoricalRunBannerProps {
  readonly artifact: AgentRunArtifact;
  readonly onBackToLive: () => void;
}

export function HistoricalRunBanner({ artifact, onBackToLive }: HistoricalRunBannerProps) {
  return (
    <div className="historical-run-banner" data-testid="historical-run-banner">
      <p className="historical-run-banner__text">
        Viewing Run #{artifact.runNumber} · {artifact.prompt.slice(0, 80)}
        {artifact.prompt.length > 80 ? "…" : ""} · {formatGreenfieldElapsed(artifact.durationMs)}
      </p>
      <button type="button" className="build-view__link" onClick={onBackToLive}>
        Back to live
      </button>
    </div>
  );
}
