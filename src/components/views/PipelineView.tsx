import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { EmptyState } from "@/components/EmptyState";
import { formatDuration } from "@/core/analytics/costEstimates";
import { formatPlannerOutputSummary } from "@/core/pipeline/plannerOutput";
import type {
  PipelineRunStatus,
  PipelineStageId,
  PipelineStageRecord,
} from "@/core/pipeline/types";
import { PIPELINE_STAGE_ORDER } from "@/core/pipeline/types";
import { isPipelineMode } from "@/core/providers/orchestration";
import { PROVIDER_DISPLAY_LABELS } from "@/core/providers/providerStatus";

const STAGE_LABELS: Record<PipelineStageId, string> = {
  planner: "Planner",
  coder: "Coder",
  verifier: "Verifier",
  repair: "Repair",
  complete: "Complete",
};

function formatRunStatus(status: PipelineRunStatus): string {
  return status.replace(/_/g, " ");
}

function formatProvider(
  stage: PipelineStageRecord,
): string {
  if (stage.provider === "local") return "Local";
  return PROVIDER_DISPLAY_LABELS[stage.provider] ?? stage.provider;
}

function statusClass(status: PipelineStageRecord["status"]): string {
  switch (status) {
    case "running":
      return "pipeline-stage--running";
    case "success":
      return "pipeline-stage--success";
    case "failed":
      return "pipeline-stage--failed";
    case "skipped":
      return "pipeline-stage--skipped";
    default:
      return "pipeline-stage--pending";
  }
}

export function PipelineView() {
  const {
    project,
    pipelineSession,
    pipelineRunning,
    pipelineError,
    runMultiAgentPipeline,
    continueMultiAgentPipeline,
    continueMultiAgentPipelineRepair,
    cancelMultiAgentPipeline,
    approveAllPlanApplyFiles,
    autoFixSession,
    setCenterTab,
    setRailTool,
    selectContextSnapshot,
    planApplySession,
  } = useWorkspace();

  const [prompt, setPrompt] = useState("");
  const api = window.bryantlabs;
  const [agentMode, setAgentMode] = useState<"single" | "pipeline">("single");

  useEffect(() => {
    if (!api) return;
    void api.getProviderSettings().then((s) => {
      setAgentMode(isPipelineMode(s) ? "pipeline" : "single");
    });
  }, [api, pipelineRunning]);

  const stages = pipelineSession?.stages ?? [];
  const stageMap = useMemo(
    () => new Map(stages.map((s) => [s.id, s])),
    [stages],
  );

  const awaitingReview = pipelineSession?.status === "awaiting_review";
  const canContinue =
    awaitingReview &&
    planApplySession &&
    (planApplySession.phase === "review" ||
      planApplySession.phase === "waiting_for_review");

  const awaitingRepair =
    pipelineSession?.status === "repairing" &&
    autoFixSession?.phase === "awaiting_approval";

  if (!project) {
    return (
      <EmptyState
        title="No project open"
        description="Open a project to run the multi-agent pipeline."
      />
    );
  }

  if (agentMode !== "pipeline") {
    return (
      <div className="pipeline-view">
        <header className="pipeline-view__hero">
          <h3 className="pipeline-view__title">Multi-Agent Pipeline</h3>
          <p className="plan__muted">
            Switch to <strong>Multi-Agent Pipeline</strong> mode in Providers to
            enable Planner → Coder → Verifier → Repair orchestration.
          </p>
        </header>
        <button
          type="button"
          className="prov-btn"
          onClick={() => setRailTool("providers")}
        >
          Open Providers
        </button>
      </div>
    );
  }

  return (
    <div className="pipeline-view">
      <header className="pipeline-view__hero">
        <div>
          <h3 className="pipeline-view__title">Multi-Agent Pipeline</h3>
          <p className="plan__muted">
            Planner → Coder → Verifier → Repair with shared context, memory, and
            provider routing.
          </p>
        </div>
        {pipelineSession ? (
          <span className={`pipeline-view__status pipeline-view__status--${pipelineSession.status}`}>
            {formatRunStatus(pipelineSession.status)}
          </span>
        ) : null}
      </header>

      <section className="pipeline-view__prompt">
        <label className="pipeline-view__label" htmlFor="pipeline-prompt">
          Goal
        </label>
        <textarea
          id="pipeline-prompt"
          className="pipeline-view__textarea"
          rows={3}
          value={prompt}
          disabled={pipelineRunning}
          placeholder="Describe the change you want across the codebase…"
          onChange={(e) => setPrompt(e.target.value)}
        />
        <div className="pipeline-view__actions">
          <button
            type="button"
            className="prov-btn prov-btn--primary"
            disabled={pipelineRunning || prompt.trim().length < 4}
            onClick={() => void runMultiAgentPipeline(prompt.trim())}
          >
            {pipelineRunning ? "Pipeline running…" : "Run pipeline"}
          </button>
          {pipelineRunning || pipelineSession ? (
            <button
              type="button"
              className="prov-btn"
              disabled={!pipelineRunning && pipelineSession?.status !== "awaiting_review"}
              onClick={() => cancelMultiAgentPipeline()}
            >
              Cancel
            </button>
          ) : null}
        </div>
        {pipelineError ? (
          <p className="pipeline-view__error" role="alert">
            {pipelineError}
          </p>
        ) : null}
      </section>

      {awaitingReview ? (
        <section className="pipeline-view__review">
          <h4 className="pipeline-view__heading">Review proposed patches</h4>
          <p className="plan__muted">
            Inspect diffs in the center panel, approve files, then continue the
            pipeline. No files are written until you continue.
          </p>
          <div className="pipeline-view__actions">
            <button
              type="button"
              className="prov-btn"
              onClick={() => setCenterTab("diff")}
            >
              Open diff review
            </button>
            <button
              type="button"
              className="prov-btn prov-btn--primary"
              disabled={!canContinue}
              onClick={() => {
                approveAllPlanApplyFiles();
                void continueMultiAgentPipeline();
              }}
            >
              Approve &amp; continue
            </button>
          </div>
        </section>
      ) : null}

      {awaitingRepair ? (
        <section className="pipeline-view__review">
          <h4 className="pipeline-view__heading">Repair awaiting approval</h4>
          <p className="plan__muted">
            Review the proposed repair, then continue the pipeline or cancel.
          </p>
          <div className="pipeline-view__actions">
            <button
              type="button"
              className="prov-btn prov-btn--primary"
              onClick={() => void continueMultiAgentPipelineRepair()}
            >
              Approve repair &amp; continue
            </button>
            <button
              type="button"
              className="prov-btn"
              onClick={() => cancelMultiAgentPipeline()}
            >
              Cancel pipeline
            </button>
          </div>
        </section>
      ) : null}

      <section className="pipeline-view__board" aria-label="Pipeline stages">
        {PIPELINE_STAGE_ORDER.map((id) => {
          const stage = stageMap.get(id);
          if (!stage) return null;
          return (
            <article
              key={id}
              className={`pipeline-stage ${statusClass(stage.status)}`}
            >
              <header className="pipeline-stage__head">
                <h4 className="pipeline-stage__title">{STAGE_LABELS[id]}</h4>
                <span className="pipeline-stage__badge">{stage.status}</span>
              </header>
              <dl className="pipeline-stage__meta">
                <div>
                  <dt>Provider</dt>
                  <dd>
                    {formatProvider(stage)}
                    {stage.model ? ` · ${stage.model}` : ""}
                  </dd>
                </div>
                <div>
                  <dt>Duration</dt>
                  <dd>
                    {stage.durationMs != null
                      ? formatDuration(stage.durationMs)
                      : stage.status === "running"
                        ? "…"
                        : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Tokens</dt>
                  <dd>
                    {stage.estimatedTokens > 0
                      ? stage.estimatedTokens.toLocaleString()
                      : "—"}
                  </dd>
                </div>
              </dl>
              {stage.summary ? (
                <p className="pipeline-stage__summary">{stage.summary}</p>
              ) : null}
              {stage.error ? (
                <p className="pipeline-stage__error">{stage.error}</p>
              ) : null}
              {stage.contextSnapshotId ? (
                <button
                  type="button"
                  className="pipeline-stage__context-link"
                  onClick={() => {
                    selectContextSnapshot(stage.contextSnapshotId);
                    setRailTool("context");
                  }}
                >
                  Inspect context
                </button>
              ) : null}
            </article>
          );
        })}
      </section>

      {pipelineSession?.plannerOutput ? (
        <section className="pipeline-view__planner-output">
          <h4 className="pipeline-view__heading">Planner output</h4>
          <pre className="pipeline-view__pre">
            {formatPlannerOutputSummary(pipelineSession.plannerOutput)}
          </pre>
        </section>
      ) : null}
    </div>
  );
}
