import { useWorkspace } from "@/app/WorkspaceProvider";
import { PlanView } from "@/components/PlanView";
import { AIPlanView } from "@/components/AIPlanView";
import { PlanApplyReview } from "@/components/PlanApplyReview";
import { computeAgreement } from "@/core/planner/context";
import type { Plan } from "@/core/planner";
import { resolveUserPlanPrompt } from "@/core/planApply/prompt";

/**
 * Side-by-side comparison (Phase 7.5): the deterministic plan vs an AI plan
 * for the same prompt, plus an agreement score. Both are read-only.
 */
export function PlanComparisonView({ plan }: { plan: Plan }) {
  const {
    aiPlan,
    aiPlanStatus,
    runAIPlan,
    startApplyPlan,
    planApplySession,
    lastPlanPrompt,
    project,
    sessionMemoryDiagnostics,
    startMultiFileExecution,
    executionSession,
  } = useWorkspace();

  const aiOk = aiPlan?.ok && aiPlan.plan;
  const agreement = aiOk ? computeAgreement(plan, aiPlan.plan!) : null;
  const userPrompt = resolveUserPlanPrompt(plan, lastPlanPrompt);

  return (
    <div className="plan-compare">
      <div className="plan-compare__bar">
        <button
          type="button"
          className="plan-compare__run"
          onClick={() => void runAIPlan()}
          disabled={aiPlanStatus === "running"}
        >
          {aiPlanStatus === "running"
            ? "Asking provider…"
            : aiPlan && !aiPlan.ok
              ? "Retry AI Plan"
              : aiPlan
                ? "Re-run AI plan"
                : "Run AI plan"}
        </button>
        {agreement ? (
          <span
            className={`plan-compare__agree plan-compare__agree--${
              agreement.score >= 60 ? "high" : agreement.score >= 30 ? "mid" : "low"
            }`}
            title="Overlap of likely-affected files (by filename)"
          >
            Agreement: {agreement.score}%
          </span>
        ) : null}
        {aiPlan ? (
          <span className="plan-compare__via">
            via {aiPlan.provider} · {aiPlan.model}
          </span>
        ) : null}
        <button
          type="button"
          className="prov-btn prov-btn--primary plan-compare__apply"
          disabled={
            !project ||
            !userPrompt ||
            plan.files.length === 0 ||
            planApplySession?.phase === "proposing" ||
            planApplySession?.phase === "applying" ||
            planApplySession?.phase === "verifying"
          }
          onClick={() => void startApplyPlan()}
        >
          {planApplySession?.phase === "proposing"
            ? "Applying plan…"
            : "Apply Plan"}
        </button>
        <button
          type="button"
          className="prov-btn plan-compare__execute"
          disabled={
            !project ||
            !aiOk ||
            executionSession?.phase === "running" ||
            executionSession?.phase === "verifying"
          }
          title="Coordinated multi-file execution with ordered steps"
          onClick={() => void startMultiFileExecution()}
        >
          {executionSession?.phase === "running"
            ? "Executing…"
            : "Run Execution"}
        </button>
      </div>

      {sessionMemoryDiagnostics?.used &&
      (aiPlanStatus === "running" || aiPlan) ? (
        <div className="plan-compare__memory" role="status">
          {sessionMemoryDiagnostics.lines.map((line) => (
            <p key={line} className="plan-compare__memory-line">
              {line}
            </p>
          ))}
        </div>
      ) : null}

      {agreement ? (
        <div className="plan-compare__summary">
          <AgreeChips label="Both" tone="shared" items={agreement.shared} />
          <AgreeChips
            label="Deterministic only"
            tone="det"
            items={agreement.onlyDeterministic}
          />
          <AgreeChips label="AI only" tone="ai" items={agreement.onlyAI} />
          <span className="plan-compare__conf">
            Confidence{" "}
            {agreement.confidenceMatch ? "matches" : "differs"} (deterministic{" "}
            {plan.confidence} vs AI {aiPlan!.plan!.confidence})
          </span>
        </div>
      ) : null}

      <PlanApplyReview />

      <div className="plan-compare__cols">
        <section className="plan-compare__col">
          <header className="plan-compare__coltitle">Deterministic</header>
          <PlanView plan={plan} />
        </section>
        <section className="plan-compare__col">
          <header className="plan-compare__coltitle">AI</header>
          {aiPlanStatus === "running" ? (
            <p className="plan-compare__hint">
              Sending project context to the active provider…
            </p>
          ) : aiPlan ? (
            <AIPlanView result={aiPlan} />
          ) : (
            <p className="plan-compare__hint">
              No AI plan yet. Click <strong>Run AI plan</strong> to ask the active
              provider (configure it in the Providers tab). The provider receives
              project context and returns a plan only — no files are modified.
            </p>
          )}
        </section>
      </div>
    </div>
  );
}

function AgreeChips({
  label,
  tone,
  items,
}: {
  label: string;
  tone: string;
  items: string[];
}) {
  if (items.length === 0) return null;
  return (
    <div className="agree-row">
      <span className={`agree-row__label agree-row__label--${tone}`}>{label}</span>
      <span className="agree-row__items">{items.join(", ")}</span>
    </div>
  );
}
