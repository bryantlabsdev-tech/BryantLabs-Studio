import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import {
  agentRunStepIcon,
  type AgentRunCardViewModel,
  type AgentRunStepStatus,
} from "@/core/agent/agentRunCard";
import type { AgentRunDiagnosticItem } from "@/core/agent/agentRunInsight";
import { UiAuditFailureDiagnosticsPanel } from "@/components/views/UiAuditFailureDiagnosticsPanel";
import { formatGreenfieldElapsed } from "@/core/agent/greenfieldRunProgress";

export interface AgentRunCardProps {
  readonly viewModel: AgentRunCardViewModel;
  readonly runNumber?: number;
  readonly frozen?: boolean;
  readonly selected?: boolean;
  readonly onSelect?: () => void;
  readonly onCancel?: () => void;
  readonly onOpenConsole?: () => void;
  readonly onRetry?: () => void;
  readonly onSwitchProvider?: () => void;
}

type AgentRunSection = "reasoning" | "timeline" | "files" | "verification" | "diagnostics";

const SECTION_LABELS: Record<AgentRunSection, string> = {
  reasoning: "Reasoning",
  timeline: "Timeline",
  files: "Files",
  verification: "Verification",
  diagnostics: "Diagnostics",
};

function verificationLabel(
  kind: "typescript" | "build" | "uiAudit" | "preview",
  value: AgentRunCardViewModel["verification"][typeof kind],
): string | null {
  switch (kind) {
    case "typescript":
      if (value === "passed") return "TypeScript passed";
      if (value === "failed") return "TypeScript failed";
      if (value === "skipped") return "TypeScript skipped";
      return null;
    case "build":
      if (value === "passed") return "Build passed";
      if (value === "failed") return "Build failed";
      if (value === "skipped") return "Build skipped";
      return null;
    case "uiAudit":
      if (value === "passed") return "UI audit passed";
      if (value === "failed") return "UI audit failed";
      if (value === "skipped") return null;
      return null;
    case "preview":
      if (value === "ready") return "Preview ready";
      if (value === "failed") return "Preview failed";
      if (value === "skipped") return null;
      return null;
    default:
      return null;
  }
}

function stepStatusClass(status: AgentRunStepStatus): string {
  return `agent-run-card__step--${status}`;
}

function resolveDefaultSection(viewModel: AgentRunCardViewModel): AgentRunSection {
  if (viewModel.diagnostics.isVisible) return "diagnostics";
  if (viewModel.overallStatus === "failed") return "diagnostics";
  if (viewModel.patchImpact.isVisible || viewModel.fileActivity.length > 0) return "files";
  if (viewModel.reasoning.isVisible) return "reasoning";
  return "timeline";
}

function sectionAvailable(viewModel: AgentRunCardViewModel, section: AgentRunSection): boolean {
  switch (section) {
    case "reasoning":
      return viewModel.reasoning.isVisible;
    case "timeline":
      return viewModel.steps.length > 0;
    case "files":
      return (
        viewModel.patchImpact.isVisible ||
        viewModel.fileActivity.length > 0 ||
        viewModel.filesPlanned.length > 0 ||
        viewModel.filesModified.length > 0
      );
    case "verification":
      return (["typescript", "build", "uiAudit", "preview"] as const).some((key) =>
        Boolean(verificationLabel(key, viewModel.verification[key])),
      );
    case "diagnostics":
      return viewModel.diagnostics.isVisible || Boolean(viewModel.failureDiagnosis?.isVisible);
    default:
      return false;
  }
}

function DenseBlock({
  label,
  children,
}: {
  readonly label: string;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="agent-run-card__dense-block">
      <div className="agent-run-card__dense-label">{label}</div>
      <div className="agent-run-card__dense-body">{children}</div>
    </div>
  );
}

function ReasoningSection({ viewModel }: { readonly viewModel: AgentRunCardViewModel }) {
  const { reasoning, confidence } = viewModel;
  if (!reasoning.isVisible) {
    return <p className="agent-run-card__empty-section">No planner output yet.</p>;
  }

  return (
    <div className="agent-run-card__section-body" data-testid="agent-run-reasoning">
      {reasoning.headline ? (
        <p className="agent-run-card__reasoning-headline">{reasoning.headline}</p>
      ) : null}

      {reasoning.plannerReasoning.length > 0 ? (
        <DenseBlock label="Planner reasoning">
          <ul className="agent-run-card__dense-list">
            {reasoning.plannerReasoning.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </DenseBlock>
      ) : null}

      {reasoning.detected.length > 0 ? (
        <DenseBlock label="Detected">
          <ul className="agent-run-card__dense-list">
            {reasoning.detected.map((item) => (
              <li key={item.text}>
                {item.ok ? "✓" : "⚠"} {item.text}
              </li>
            ))}
          </ul>
        </DenseBlock>
      ) : null}

      {reasoning.planSteps.length > 0 ? (
        <DenseBlock label="Plan">
          <ol className="agent-run-card__dense-list agent-run-card__dense-list--ordered">
            {reasoning.planSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </DenseBlock>
      ) : null}

      <DenseBlock label="Confidence">
        <p className="agent-run-card__dense-inline">
          <strong>{confidence.percent}%</strong>
          <span className="agent-run-card__dense-muted"> · {confidence.level}</span>
        </p>
        <ul className="agent-run-card__dense-list agent-run-card__dense-list--compact">
          {confidence.factors.slice(0, 4).map((factor) => (
            <li key={factor.text}>
              {factor.positive ? "✓" : "⚠"} {factor.text}
            </li>
          ))}
        </ul>
      </DenseBlock>

      {reasoning.risks.length > 0 ? (
        <DenseBlock label="Risks">
          <ul className="agent-run-card__dense-list">
            {reasoning.risks.map((risk) => (
              <li key={risk}>⚠ {risk}</li>
            ))}
          </ul>
        </DenseBlock>
      ) : null}
    </div>
  );
}

function TimelineSection({ viewModel }: { readonly viewModel: AgentRunCardViewModel }) {
  return (
    <div className="agent-run-card__section-body" data-testid="agent-run-steps">
      {viewModel.latestProviderEvent ? (
        <p className="agent-run-card__live-event">{viewModel.latestProviderEvent}</p>
      ) : null}
      <ol className="agent-run-card__steps agent-run-card__steps--compact">
        {viewModel.steps.map((step) => (
          <li
            key={step.id}
            className={`agent-run-card__step ${stepStatusClass(step.status)}`}
            data-testid={`agent-run-step-${step.id}`}
            data-status={step.status}
          >
            <span className="agent-run-card__step-icon" aria-hidden>
              {step.status === "retrying" ? (
                <span className="agent-run-card__retry-spinner" />
              ) : (
                agentRunStepIcon(step.status)
              )}
            </span>
            <span className="agent-run-card__step-label">{step.label}</span>
          </li>
        ))}
      </ol>
      {viewModel.providerEvents.length > 1 ? (
        <ul className="agent-run-card__events agent-run-card__events--compact">
          {viewModel.providerEvents.slice(-3).map((event) => (
            <li key={event}>{event}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function FilesSection({ viewModel }: { readonly viewModel: AgentRunCardViewModel }) {
  const { patchImpact, fileActivity, filesModified, filesPlanned } = viewModel;
  const hasImpact = patchImpact.isVisible && patchImpact.files.length > 0;
  const editing = fileActivity.filter((f) => f.status === "editing");
  const written = fileActivity.filter((f) => f.status === "written");

  if (!hasImpact && editing.length === 0 && written.length === 0 && filesModified.length === 0) {
    return <p className="agent-run-card__empty-section">No file activity yet.</p>;
  }

  return (
    <div className="agent-run-card__section-body" data-testid="agent-run-files">
      {hasImpact ? (
        <DenseBlock label="Files to modify">
          <ul className="agent-run-card__impact-files">
            {patchImpact.files.map((file) => (
              <li key={file.path} className="agent-run-card__impact-file">
                <span>{file.path}</span>
                <span className="agent-run-card__impact-stats">
                  +{file.added} / -{file.removed}
                </span>
              </li>
            ))}
          </ul>
          <p className="agent-run-card__dense-inline agent-run-card__dense-muted">
            {patchImpact.complexity} complexity · {patchImpact.risk} risk · {patchImpact.estimatedTime}
          </p>
        </DenseBlock>
      ) : null}

      {editing.length > 0 ? (
        <DenseBlock label="Editing">
          <ul className="agent-run-card__dense-list">
            {editing.map((f) => (
              <li key={f.path}>{f.path}</li>
            ))}
          </ul>
        </DenseBlock>
      ) : null}

      {written.length > 0 ? (
        <DenseBlock label="Written">
          <ul className="agent-run-card__dense-list">
            {written.map((f) => (
              <li key={f.path} className="agent-run-card__file-activity-item--written">
                ✅ {f.path} updated
              </li>
            ))}
          </ul>
        </DenseBlock>
      ) : null}

      {filesPlanned.length > 0 ? (
        <DenseBlock label="Planned">
          <ul className="agent-run-card__dense-list">
            {filesPlanned.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </DenseBlock>
      ) : null}

      {filesModified.length > 0 ? (
        <DenseBlock label="Modified">
          <ul className="agent-run-card__dense-list">
            {filesModified.map((f) => (
              <li key={f}>{f}</li>
            ))}
          </ul>
        </DenseBlock>
      ) : null}
    </div>
  );
}

function VerificationSection({ viewModel }: { readonly viewModel: AgentRunCardViewModel }) {
  const items = (["typescript", "build", "uiAudit", "preview"] as const)
    .map((key) => {
      const label = verificationLabel(key, viewModel.verification[key]);
      if (!label) return null;
      return { key, label, failed: label.includes("failed") };
    })
    .filter(Boolean) as Array<{ key: string; label: string; failed: boolean }>;

  if (items.length === 0) {
    return <p className="agent-run-card__empty-section">Verification has not run yet.</p>;
  }

  return (
    <ul className="agent-run-card__verification agent-run-card__verification--compact" data-testid="agent-run-verification">
      {items.map((item) => (
        <li
          key={item.key}
          className={`agent-run-card__verification-item${item.failed ? " agent-run-card__verification-item--failed" : ""}`}
        >
          {item.failed ? "❌" : "✅"} {item.label}
        </li>
      ))}
    </ul>
  );
}

function DiagnosticCard({ item }: { readonly item: AgentRunDiagnosticItem }) {
  if (item.uiAudit) {
    return <UiAuditFailureDiagnosticsPanel diagnostics={item.uiAudit} />;
  }

  return (
    <article className="agent-run-card__diagnosis-card">
      <h4 className="agent-run-card__diagnosis-title">{item.title}</h4>
      {item.whatFailed ? (
        <p className="agent-run-card__diagnosis-reason">
          <span className="agent-run-card__dense-label">What failed:</span> {item.whatFailed}
        </p>
      ) : null}
      {item.errorLocation ? (
        <p className="agent-run-card__diagnosis-location">{item.errorLocation}</p>
      ) : null}
      <p className="agent-run-card__diagnosis-reason">
        <span className="agent-run-card__dense-label">Reason:</span> {item.reason}
      </p>
      {item.suggestedFix ? (
        <p className="agent-run-card__diagnosis-fix">
          <span className="agent-run-card__dense-label">Suggested fix:</span> {item.suggestedFix}
        </p>
      ) : null}
      {item.detailLines?.map((line) => (
        <p key={line} className="agent-run-card__diagnosis-detail">
          {line}
        </p>
      ))}
    </article>
  );
}

function DiagnosticsSection({ viewModel }: { readonly viewModel: AgentRunCardViewModel }) {
  const items =
    viewModel.diagnostics.items.length > 0
      ? viewModel.diagnostics.items
      : viewModel.failureDiagnosis
        ? [
            {
              title: viewModel.failureDiagnosis.title,
              reason: viewModel.failureDiagnosis.reason,
              suggestedFix: viewModel.failureDiagnosis.suggestedFix,
              errorLocation: viewModel.failureDiagnosis.errorLocation,
              errorType: viewModel.failureDiagnosis.errorType,
            },
          ]
        : [];

  if (items.length === 0) {
    return <p className="agent-run-card__empty-section">No diagnostics.</p>;
  }

  return (
    <div className="agent-run-card__section-body" data-testid="agent-run-failure-diagnosis">
      {items.map((item) => (
        <DiagnosticCard key={`${item.title}-${item.reason}`} item={item} />
      ))}
    </div>
  );
}

function RunBlockSteps({ viewModel }: { readonly viewModel: AgentRunCardViewModel }) {
  const visibleSteps = viewModel.steps.filter((step) => step.status !== "pending");
  if (visibleSteps.length === 0) return null;

  return (
    <ol className="agent-run-card__block-steps" data-testid="agent-run-block-steps">
      {visibleSteps.map((step) => (
        <li
          key={step.id}
          className={`agent-run-card__block-step agent-run-card__block-step--${step.status}`}
        >
          <span className="agent-run-card__block-step-icon" aria-hidden>
            {agentRunStepIcon(step.status)}
          </span>
          <span>{step.label}</span>
        </li>
      ))}
    </ol>
  );
}

function RunBlockFiles({ viewModel }: { readonly viewModel: AgentRunCardViewModel }) {
  const files = viewModel.fileActivity.length
    ? viewModel.fileActivity
    : viewModel.filesModified.map((path) => ({ path, status: "written" as const }));

  if (files.length === 0) return null;

  return (
    <ul className="agent-run-card__block-files" data-testid="agent-run-block-files">
      {files.map((file) => (
        <li
          key={file.path}
          className={`agent-run-card__block-file agent-run-card__block-file--${file.status}`}
        >
          <span aria-hidden>{file.status === "written" ? "✓" : "…"}</span>
          <span>{file.path}</span>
        </li>
      ))}
    </ul>
  );
}

function RunBlockThoughts({ viewModel }: { readonly viewModel: AgentRunCardViewModel }) {
  const thoughts = viewModel.thoughtStream.slice(-6);
  if (thoughts.length === 0) return null;

  return (
    <ul className="agent-run-card__block-thoughts" data-testid="agent-run-thought-stream">
      {thoughts.map((event) => (
        <li key={event.id}>{event.text}</li>
      ))}
    </ul>
  );
}

function RunBlockFailure({ viewModel }: { readonly viewModel: AgentRunCardViewModel }) {
  const diagnosis = viewModel.failureDiagnosis;
  if (!diagnosis?.isVisible) return null;

  return (
    <div className="agent-run-card__block-failure" data-testid="agent-run-failure-narrative">
      <p className="agent-run-card__block-failure-title">{diagnosis.title}</p>
      <p className="agent-run-card__block-failure-reason">
        <span className="agent-run-card__dense-label">Reason:</span> {diagnosis.reason}
      </p>
      {diagnosis.suggestedFix ? (
        <p className="agent-run-card__block-failure-fix">
          <span className="agent-run-card__dense-label">Suggested fix:</span> {diagnosis.suggestedFix}
        </p>
      ) : null}
    </div>
  );
}

function ProgressBar({
  percent,
  label,
  isRunning,
}: {
  readonly percent: number;
  readonly label: string;
  readonly isRunning: boolean;
}) {
  return (
    <div className="agent-run-card__progress" data-testid="agent-run-progress">
      <div className="agent-run-card__progress-head">
        <span className="agent-run-card__progress-label">{label}</span>
        <span className="agent-run-card__progress-percent" data-testid="agent-run-progress-percent">
          {percent}%
        </span>
      </div>
      <div
        className="agent-run-card__progress-track"
        role="progressbar"
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={label}
      >
        <span
          className={`agent-run-card__progress-fill${isRunning ? " agent-run-card__progress-fill--active" : ""}`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

export function AgentRunCard({
  viewModel,
  runNumber,
  frozen = false,
  selected = false,
  onSelect,
  onCancel,
  onOpenConsole,
  onRetry,
  onSwitchProvider,
}: AgentRunCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [activeSection, setActiveSection] = useState<AgentRunSection>(() =>
    resolveDefaultSection(viewModel),
  );

  const isRunning = viewModel.overallStatus === "running";
  const currentLabel = viewModel.currentStep?.label ?? "Working…";

  const visibleSections = useMemo(
    () =>
      (Object.keys(SECTION_LABELS) as AgentRunSection[]).filter((section) =>
        sectionAvailable(viewModel, section),
      ),
    [viewModel],
  );

  useEffect(() => {
    if (!visibleSections.includes(activeSection)) {
      setActiveSection(resolveDefaultSection(viewModel));
    }
  }, [viewModel.streamRevision, visibleSections, activeSection, viewModel]);

  const summaryLine =
    viewModel.successSummary?.summaryLine ?? viewModel.summary ?? null;

  const handleSelectKeyDown = (event: KeyboardEvent<HTMLElement>) => {
    if (!onSelect) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onSelect();
    }
  };

  return (
    <article
      className={[
        "agent-run-card",
        `agent-run-card--${viewModel.overallStatus}`,
        frozen ? "agent-run-card--frozen" : "",
        selected ? "agent-run-card--selected" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      aria-live={frozen ? "off" : "polite"}
      data-testid="agent-run-card"
      data-stream-revision={viewModel.streamRevision}
      {...(onSelect
        ? { role: "button", tabIndex: 0, onClick: onSelect, onKeyDown: handleSelectKeyDown }
        : {})}
    >
      <header className="agent-run-card__head">
        <div className="agent-run-card__head-main">
          <span className="agent-run-card__title">
            {runNumber != null ? `Run #${runNumber}` : viewModel.title}
          </span>
          {isRunning && !frozen ? (
            <span className="agent-run-card__spinner" aria-hidden data-testid="agent-run-spinner" />
          ) : null}
        </div>
        <div className="agent-run-card__head-meta">
          <span className="agent-run-card__confidence-badge" data-testid="agent-run-confidence">
            {viewModel.confidence.percent}%
          </span>
          <span className="agent-run-card__elapsed" data-testid="agent-run-duration">
            {formatGreenfieldElapsed(viewModel.durationMs)}
          </span>
        </div>
      </header>

      <ProgressBar
        percent={viewModel.progressPercent}
        label={isRunning ? currentLabel : summaryLine ? "Complete" : currentLabel}
        isRunning={isRunning && !frozen}
      />

      {!expanded ? (
        <div className="agent-run-card__collapsed" data-testid="agent-run-collapsed">
          <RunBlockSteps viewModel={viewModel} />
          <RunBlockFiles viewModel={viewModel} />
          <RunBlockThoughts viewModel={viewModel} />
          <RunBlockFailure viewModel={viewModel} />
          {!frozen ? (
            <p className="agent-run-card__status-line">
              <span className="agent-run-card__status-icon">
                {agentRunStepIcon(
                  isRunning
                    ? (viewModel.currentStep?.status ?? "running")
                    : viewModel.overallStatus === "failed"
                      ? "failed"
                      : "success",
                )}
              </span>
              <span>{isRunning ? currentLabel : summaryLine ?? currentLabel}</span>
            </p>
          ) : null}
          {viewModel.providerIdentityLine ? (
            <p className="agent-run-card__provider-line agent-run-card__provider-line--compact">
              {viewModel.providerIdentityLine}
            </p>
          ) : null}
        </div>
      ) : (
        <div className="agent-run-card__expanded" data-testid="agent-run-expanded">
          <div className="agent-run-card__tabs" role="tablist" aria-label="Run details">
            {visibleSections.map((section) => (
              <button
                key={section}
                type="button"
                role="tab"
                aria-selected={activeSection === section}
                className={`agent-run-card__tab${activeSection === section ? " agent-run-card__tab--active" : ""}`}
                onClick={() => setActiveSection(section)}
                data-testid={`agent-run-tab-${section}`}
              >
                {SECTION_LABELS[section]}
              </button>
            ))}
          </div>

          <div className="agent-run-card__section" role="tabpanel">
            {activeSection === "reasoning" ? <ReasoningSection viewModel={viewModel} /> : null}
            {activeSection === "timeline" ? <TimelineSection viewModel={viewModel} /> : null}
            {activeSection === "files" ? <FilesSection viewModel={viewModel} /> : null}
            {activeSection === "verification" ? <VerificationSection viewModel={viewModel} /> : null}
            {activeSection === "diagnostics" ? <DiagnosticsSection viewModel={viewModel} /> : null}
          </div>

          {viewModel.successSummary && !isRunning ? (
            <p className="agent-run-card__summary agent-run-card__summary--footer" data-testid="agent-run-summary">
              {viewModel.successSummary.summaryLine}
            </p>
          ) : null}
        </div>
      )}

      <footer className="agent-run-card__footer">
        <button
          type="button"
          className="build-view__link agent-run-card__toggle"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
          data-testid="agent-run-details-toggle"
        >
          {expanded ? "Hide details" : "View details"}
        </button>
        <div className="agent-run-card__actions">
          {isRunning && !frozen && onCancel ? (
            <button type="button" className="prov-btn" onClick={onCancel}>
              Cancel
            </button>
          ) : null}
          {onOpenConsole ? (
            <button type="button" className="build-view__link" onClick={onOpenConsole}>
              Console
            </button>
          ) : null}
          {viewModel.showRecoveryActions && !frozen && onRetry ? (
            <button type="button" className="build-view__link" onClick={onRetry}>
              Retry
            </button>
          ) : null}
          {viewModel.showRecoveryActions && !frozen && onSwitchProvider ? (
            <button type="button" className="build-view__link" onClick={onSwitchProvider}>
              Switch provider
            </button>
          ) : null}
        </div>
      </footer>
    </article>
  );
}
