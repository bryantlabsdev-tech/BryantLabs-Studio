import {
  FOLLOWUP_TIMELINE_STEPS,
  FOLLOWUP_PHASE_LABELS,
  followUpStepIndex,
  type FollowUpDisplayPhase,
} from "@/core/build/followUpUi";

interface FollowUpTimelineProps {
  phase: FollowUpDisplayPhase;
}

export function FollowUpTimeline({ phase }: FollowUpTimelineProps) {
  const activeIdx = followUpStepIndex(phase);
  if (phase === "idle") return null;

  return (
    <ol className="follow-up-timeline" aria-label="Follow-up progress">
      {FOLLOWUP_TIMELINE_STEPS.map((step, i) => {
        const done = activeIdx > i || phase === "done";
        const active = activeIdx === i && phase !== "done" && phase !== "failed";
        const failed = phase === "failed" && i === Math.max(activeIdx, 0);
        return (
          <li
            key={step}
            className={[
              "follow-up-timeline__step",
              done ? "follow-up-timeline__step--done" : "",
              active ? "follow-up-timeline__step--active" : "",
              failed ? "follow-up-timeline__step--failed" : "",
            ]
              .filter(Boolean)
              .join(" ")}
          >
            <span className="follow-up-timeline__dot" aria-hidden />
            <span className="follow-up-timeline__label">
              {FOLLOWUP_PHASE_LABELS[step]}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
