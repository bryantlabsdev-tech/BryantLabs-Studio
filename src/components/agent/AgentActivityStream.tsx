import { useMemo } from "react";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import type { BuildLoopPhase } from "@/core/build/types";
import type { PlanApplySession } from "@/core/planApply/types";
import type { RunTimelineSnapshot } from "@/core/agent/runTimeline";
import { deriveAgentOperationalActivity } from "@/core/agent/deriveAgentOperationalActivity";
import { AgentActivityStep } from "@/components/agent/AgentActivityStep";

export interface AgentActivityStreamProps {
  readonly card: AgentRunCardViewModel;
  readonly buildPhase: BuildLoopPhase;
  readonly planApplySession: PlanApplySession | null;
  readonly scanStatus: "idle" | "scanning" | "done" | "error";
  readonly timeline: RunTimelineSnapshot | null;
  readonly runStartedAt: number | null;
  readonly compact?: boolean;
}

export function AgentActivityStream({
  card,
  buildPhase,
  planApplySession,
  scanStatus,
  timeline,
  runStartedAt,
  compact = false,
}: AgentActivityStreamProps) {
  const steps = useMemo(
    () =>
      deriveAgentOperationalActivity({
        card,
        buildPhase,
        planApplySession,
        scanStatus,
        timeline,
        runStartedAt,
      }),
    [card, buildPhase, planApplySession, scanStatus, timeline, runStartedAt],
  );

  const visibleSteps = compact
    ? steps.filter((s) => s.status === "active" || s.status === "failed").slice(-4)
    : steps;

  if (visibleSteps.length === 0) return null;

  return (
    <section className="agent-activity-stream" data-testid="agent-activity-stream" aria-live="polite">
      {!compact ? <h4 className="agent-activity-stream__title">Live activity</h4> : null}
      <ol className="agent-activity-stream__list">
        {visibleSteps.map((step) => (
          <AgentActivityStep key={step.id} step={step} />
        ))}
      </ol>
    </section>
  );
}
