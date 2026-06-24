import { useMemo } from "react";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import type { BuildLoopPhase } from "@/core/build/types";
import type { PlanApplySession } from "@/core/planApply/types";
import type { RunTimelineSnapshot } from "@/core/agent/runTimeline";
import {
  derivePlanPreviewPhase,
  PLAN_PREVIEW_PHASE_LABELS,
  type PlanPreviewPhase,
} from "@/core/agent/deriveAgentOperationalActivity";

export interface AgentPlanPreviewCardProps {
  readonly card: AgentRunCardViewModel;
  readonly buildPhase: BuildLoopPhase;
  readonly planApplySession: PlanApplySession | null;
  readonly scanStatus: "idle" | "scanning" | "done" | "error";
  readonly timeline: RunTimelineSnapshot | null;
  readonly runStartedAt: number | null;
}

function phaseTone(phase: PlanPreviewPhase): "default" | "running" | "success" | "failed" {
  if (phase === "failed") return "failed";
  if (phase === "completed") return "success";
  if (phase === "waiting") return "default";
  return "running";
}

function phaseDetail(
  phase: PlanPreviewPhase,
  card: AgentRunCardViewModel,
  planApplySession: PlanApplySession | null,
): string {
  switch (phase) {
    case "waiting":
      return card.currentStep?.label ?? "Waiting for update.";
    case "planning":
      return card.reasoning.headline.trim() || "Building an edit plan from your request.";
    case "files_selected": {
      const count =
        planApplySession?.files.length ??
        card.patchImpact.files.length ??
        card.filesPlanned.length;
      return count > 0
        ? `${count} file${count === 1 ? "" : "s"} selected for changes.`
        : "Waiting for update.";
    }
    case "changes_proposed":
      return "Proposed edits are being prepared for review or apply.";
    case "verification_running":
      return "Running project checks before finishing.";
    case "ready_for_review":
      return "Review the proposed changes before applying them.";
    case "completed":
      return card.successSummary?.summaryLine ?? "Changes completed successfully.";
    case "failed":
      return card.failureDetails?.summaryLine ?? card.summary ?? "Run did not complete.";
    default:
      return "Waiting for update.";
  }
}

export function AgentPlanPreviewCard({
  card,
  buildPhase,
  planApplySession,
  scanStatus,
  timeline,
  runStartedAt,
}: AgentPlanPreviewCardProps) {
  const phase = useMemo(
    () =>
      derivePlanPreviewPhase({
        card,
        buildPhase,
        planApplySession,
        scanStatus,
        timeline,
        runStartedAt,
      }),
    [card, buildPhase, planApplySession, scanStatus, timeline, runStartedAt],
  );

  const tone = phaseTone(phase);

  return (
    <section
      className={["agent-plan-preview", `agent-plan-preview--${tone}`].join(" ")}
      data-testid="agent-plan-preview"
      data-phase={phase}
    >
      <header className="agent-plan-preview__head">
        <span className="agent-plan-preview__icon" aria-hidden>
          {tone === "running" ? "◉" : tone === "success" ? "✓" : tone === "failed" ? "!" : "○"}
        </span>
        <div>
          <p className="agent-plan-preview__eyebrow">Plan status</p>
          <h4 className="agent-plan-preview__phase">{PLAN_PREVIEW_PHASE_LABELS[phase]}</h4>
        </div>
        {card.providerIdentityLine ? (
          <span className="agent-plan-preview__chip">{card.providerIdentityLine}</span>
        ) : null}
      </header>
      <p className="agent-plan-preview__detail">{phaseDetail(phase, card, planApplySession)}</p>
    </section>
  );
}
