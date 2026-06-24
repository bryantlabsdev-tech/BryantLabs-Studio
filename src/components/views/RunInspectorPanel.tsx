import { useEffect, useMemo, useRef, useState } from "react";
import type { RunFileDiff } from "@/core/agent/runFileDiffs";
import type { AgentTraceEvent } from "@/core/agent/agentTrace";
import type { RequirementImplementationStatus } from "@/core/agent/requirementVerification";
import {
  requirementStatusLabel,
  requirementTypeLabel,
} from "@/core/agent/requirementVerification";
import type { RunInspectorTab, RunInspectorViewModel } from "@/core/agent/runInspector";
import { formatRunHealthLabel, runHealthClassName } from "@/core/agent/runHealth";
import { DiffRowsView } from "@/components/editor/DiffRowsView";

interface RunInspectorPanelProps {
  readonly model: RunInspectorViewModel;
  readonly initialTab?: RunInspectorTab;
  readonly tab?: RunInspectorTab;
  readonly onTabChange?: (tab: RunInspectorTab) => void;
  readonly preserveScroll?: boolean;
}

const TABS: { id: RunInspectorTab; label: string }[] = [
  { id: "timeline", label: "Timeline" },
  { id: "trace", label: "Agent Trace" },
  { id: "events", label: "Events" },
  { id: "ai", label: "AI Response" },
  { id: "diffs", label: "Diffs" },
  { id: "metrics", label: "Metrics" },
];

function statusClass(status: string): string {
  if (status === "success" || status === "complete") return "run-inspector__status--success";
  if (status === "failed" || status === "incomplete") return "run-inspector__status--failed";
  if (status === "running") return "run-inspector__status--running";
  return "";
}

function FileDiffSection({
  diffs,
  selectedPath,
  onSelectPath,
}: {
  readonly diffs: readonly RunFileDiff[];
  readonly selectedPath?: string | null;
  readonly onSelectPath?: (path: string) => void;
}) {
  const [internalPath, setInternalPath] = useState<string | null>(diffs[0]?.path ?? null);
  const activePath = selectedPath ?? internalPath;
  const setActivePath = onSelectPath ?? setInternalPath;
  const selected = diffs.find((diff) => diff.path === activePath) ?? diffs[0] ?? null;

  useEffect(() => {
    if (selectedPath && diffs.some((diff) => diff.path === selectedPath)) {
      setInternalPath(selectedPath);
    }
  }, [diffs, selectedPath]);

  if (diffs.length === 0) {
    return <p className="center-panel__hint">No file changes recorded for this run.</p>;
  }

  return (
    <div className="run-inspector__diff-layout">
      <ul className="run-inspector__diff-list">
        {diffs.map((diff) => (
          <li key={diff.path}>
            <button
              type="button"
              className={`run-inspector__diff-file${selected?.path === diff.path ? " run-inspector__diff-file--active" : ""}`}
              onClick={() => setActivePath(diff.path)}
            >
              <span>{diff.path}</span>
              <span className="plan__muted">
                +{diff.linesAdded} / −{diff.linesRemoved}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {selected ? (
        <div className="run-inspector__diff-pane">
          <div className="run-inspector__diff-columns">
            <section className="run-inspector__diff-column">
              <h4>Before</h4>
              <pre className="run-inspector__code">
                {selected.before?.length ? selected.before : "(empty / new file)"}
              </pre>
            </section>
            <section className="run-inspector__diff-column">
              <h4>After</h4>
              <pre className="run-inspector__code">
                {selected.after?.length ? selected.after : "(no content captured)"}
              </pre>
            </section>
          </div>
          {selected.before != null && selected.after != null ? (
            <div className="run-inspector__diff-rows">
              <h4>Changes</h4>
              <DiffRowsView before={selected.before} after={selected.after} />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function traceKindLabel(kind: AgentTraceEvent["kind"]): string {
  return kind.replace(/_/g, " ");
}

function checklistStatusClass(status: RequirementImplementationStatus): string {
  switch (status) {
    case "pass":
      return " run-inspector__checklist-item--ok";
    case "fail":
      return " run-inspector__checklist-item--missing";
    default:
      return " run-inspector__checklist-item--unknown";
  }
}

function AgentTraceSection({
  model,
  onViewDiff,
}: {
  readonly model: RunInspectorViewModel;
  readonly onViewDiff?: (path: string) => void;
}) {
  const { trace } = model;

  return (
    <div className="run-inspector__trace" data-testid="agent-trace-panel">
      <section className="run-inspector__trace-checklist">
        <h4 className="run-inspector__section-title">Requirement verification</h4>
        {trace.checklist.length === 0 ? (
          <p className="plan__muted">No requirements extracted from prompt.</p>
        ) : (
          <ul className="run-inspector__checklist">
            {trace.checklist.map((item) => (
              <li
                key={item.id}
                className={`run-inspector__checklist-item${checklistStatusClass(item.status)}`}
                data-testid={`requirement-${item.id}`}
                data-requirement-status={item.status}
              >
                <span className="run-inspector__checklist-label">
                  [{requirementTypeLabel(item.type, item.advisory)}] {item.label}
                </span>
                <span className="run-inspector__checklist-meta">
                  Detected: {item.detected ? "yes" : "no"}
                </span>
                <span className="run-inspector__checklist-meta">
                  Status: {requirementStatusLabel(item.status, item.advisory)}
                </span>
                {item.evidence ? (
                  <span className="run-inspector__detail">
                    Evidence: {item.evidence}
                  </span>
                ) : null}
                {item.reason ? (
                  <span className="run-inspector__detail plan__muted">
                    {item.reason}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
        <p
          className={`run-inspector__checklist-summary${trace.checklistComplete ? " run-inspector__status--success" : " run-inspector__status--failed"}`}
          data-testid="requirement-checklist-summary"
        >
          {trace.checklistComplete
            ? "All requirements implemented"
            : trace.checklist.some((item) => item.status === "unknown")
              ? "Implementation not verified — no generated or modified files"
              : "One or more requirements missing — run marked Incomplete"}
        </p>
      </section>

      {model.trace.repairSuggestion ? (
        <section
          className="run-inspector__trace-repair"
          data-testid="requirement-repair-suggestion"
        >
          <h4 className="run-inspector__section-title">Auto-repair suggestion</h4>
          <p className="run-inspector__repair-missing">
            <strong>Missing requirements:</strong>{" "}
            {model.trace.repairSuggestion.missingRequirements.join(", ")}
          </p>
          <p className="run-inspector__repair-reason plan__muted">
            <strong>Likely reason:</strong> {model.trace.repairSuggestion.likelyReason}
          </p>
          <p className="run-inspector__repair-prompt">
            <strong>Suggested next prompt:</strong>{" "}
            {model.trace.repairSuggestion.suggestedPrompt}
          </p>
        </section>
      ) : null}

      <section>
        <h4 className="run-inspector__section-title">Activity log</h4>
        <ol className="run-inspector__trace-events" data-testid="agent-trace-events">
          {trace.events.map((event) => (
            <li key={event.id} className="run-inspector__trace-event" data-trace-kind={event.kind}>
              <span className="run-inspector__time">{event.time}</span>
              <span className="run-inspector__trace-kind">{traceKindLabel(event.kind)}</span>
              <span className="run-inspector__trace-label">{event.label}</span>
              <span className={`run-inspector__status ${statusClass(event.status)}`}>
                {event.status}
              </span>
              {event.detail ? (
                <span className="run-inspector__detail plan__muted">{event.detail}</span>
              ) : null}
              {event.fileEdit && onViewDiff ? (
                <button
                  type="button"
                  className="run-inspector__diff-link"
                  onClick={() => onViewDiff(event.fileEdit!.path)}
                >
                  View diff
                </button>
              ) : null}
            </li>
          ))}
        </ol>
      </section>
    </div>
  );
}

export function RunInspectorPanel({
  model,
  initialTab = "timeline",
  tab,
  onTabChange,
  preserveScroll = false,
}: RunInspectorPanelProps) {
  const [internalTab, setInternalTab] = useState<RunInspectorTab>(initialTab);
  const [diffFocusPath, setDiffFocusPath] = useState<string | null>(null);
  const activeTab = tab ?? internalTab;
  const setTab = onTabChange ?? setInternalTab;
  const bodyRef = useRef<HTMLDivElement>(null);
  const scrollTopRef = useRef(0);
  const prevRunIdRef = useRef(model.runId);

  useEffect(() => {
    if (tab != null) return;
    if (prevRunIdRef.current !== model.runId) {
      setInternalTab(initialTab);
      prevRunIdRef.current = model.runId;
    }
  }, [initialTab, model.runId, tab]);

  useEffect(() => {
    if (!preserveScroll || !bodyRef.current) return;
    bodyRef.current.scrollTop = scrollTopRef.current;
  });

  const headerMeta = useMemo(() => {
    const parts = [
      model.runNumber != null ? `Run #${model.runNumber}` : null,
      model.outcomeLabel,
      model.route,
      model.metrics.durationLabel !== "—" ? model.metrics.durationLabel : null,
    ].filter(Boolean);
    return parts.join(" · ");
  }, [model]);

  if (!model.hasData) {
    return (
      <p className="center-panel__hint">
        No run data captured yet. Start a run or select a completed run from history.
      </p>
    );
  }

  return (
    <div className="run-inspector" data-testid="run-inspector-panel">
      <header className="run-inspector__head">
        <div>
          <p className="run-inspector__prompt">{model.prompt}</p>
          <p className="run-inspector__meta plan__muted">{headerMeta}</p>
          {model.health ? (
            <p
              className={runHealthClassName(model.health.tone)}
              data-testid="run-health-score"
            >
              {formatRunHealthLabel(model.health)}
            </p>
          ) : null}
        </div>
      </header>

      <nav className="run-inspector__tabs" aria-label="Run inspector sections">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`run-inspector__tab${activeTab === item.id ? " run-inspector__tab--active" : ""}`}
            aria-selected={activeTab === item.id}
            onClick={() => setTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>

      <div
        ref={bodyRef}
        className="run-inspector__body"
        onScroll={
          preserveScroll
            ? () => {
                scrollTopRef.current = bodyRef.current?.scrollTop ?? 0;
              }
            : undefined
        }
      >
        {activeTab === "timeline" ? (
          <ol className="run-inspector__timeline">
            {model.timeline.length === 0 ? (
              <li className="center-panel__hint">No timeline milestones recorded.</li>
            ) : (
              model.timeline.map((item) => (
                <li key={item.id} className="run-inspector__timeline-item">
                  <span className="run-inspector__time">{item.time}</span>
                  <span className="run-inspector__timeline-label">{item.label}</span>
                  <span className={`run-inspector__status ${statusClass(item.status)}`}>
                    {item.status}
                  </span>
                  {item.detail ? (
                    <span className="run-inspector__detail plan__muted">{item.detail}</span>
                  ) : null}
                </li>
              ))
            )}
          </ol>
        ) : null}

        {activeTab === "trace" ? (
          <AgentTraceSection
            model={model}
            onViewDiff={(path) => {
              setDiffFocusPath(path);
              setTab("diffs");
            }}
          />
        ) : null}

        {activeTab === "events" ? (
          <ul className="run-inspector__events">
            {model.events.length === 0 ? (
              <li className="center-panel__hint">No internal events recorded.</li>
            ) : (
              model.events.map((event) => (
                <li key={event.id} className="run-inspector__event">
                  <span className="run-inspector__time">{event.time}</span>
                  <code className="run-inspector__event-name">{event.event}</code>
                  <span className={`run-inspector__status ${statusClass(event.status)}`}>
                    {event.status}
                  </span>
                  <span className="run-inspector__event-msg">{event.message}</span>
                  {event.detail ? (
                    <pre className="run-inspector__event-detail">{event.detail}</pre>
                  ) : null}
                </li>
              ))
            )}
          </ul>
        ) : null}

        {activeTab === "ai" ? (
          <div className="run-inspector__ai">
            <section>
              <h4 className="run-inspector__section-title">Raw AI response</h4>
              <pre className="run-inspector__code run-inspector__code--scroll">
                {model.aiResponse.rawPreview ?? "No raw response captured for this run."}
              </pre>
            </section>
            <section>
              <h4 className="run-inspector__section-title">
                Planned files ({model.aiResponse.plannedFiles.length})
              </h4>
              <ul className="run-inspector__pill-list">
                {model.aiResponse.plannedFiles.length === 0 ? (
                  <li className="plan__muted">None</li>
                ) : (
                  model.aiResponse.plannedFiles.map((path) => (
                    <li key={path} className="run-inspector__pill">
                      {path}
                    </li>
                  ))
                )}
              </ul>
            </section>
            <section>
              <h4 className="run-inspector__section-title">
                Proposed edits ({model.aiResponse.proposedFiles.length})
              </h4>
              <ul className="run-inspector__pill-list">
                {model.aiResponse.proposedFiles.length === 0 ? (
                  <li className="plan__muted">None</li>
                ) : (
                  model.aiResponse.proposedFiles.map((path) => (
                    <li key={path} className="run-inspector__pill">
                      {path}
                    </li>
                  ))
                )}
              </ul>
            </section>
            <section>
              <h4 className="run-inspector__section-title">
                Expected files ({model.aiResponse.expectedFiles.length})
              </h4>
              <ul className="run-inspector__pill-list">
                {model.aiResponse.expectedFiles.map((path) => (
                  <li key={path} className="run-inspector__pill">
                    {path}
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h4 className="run-inspector__section-title">
                Parsed files ({model.aiResponse.parsedFiles.length})
              </h4>
              <ul className="run-inspector__pill-list">
                {model.aiResponse.parsedFiles.length === 0 ? (
                  <li className="plan__muted">None</li>
                ) : (
                  model.aiResponse.parsedFiles.map((path) => (
                    <li key={path} className="run-inspector__pill">
                      {path}
                    </li>
                  ))
                )}
              </ul>
            </section>
            <section>
              <h4 className="run-inspector__section-title">
                Missing files ({model.aiResponse.missingFiles.length})
              </h4>
              <ul className="run-inspector__pill-list">
                {model.aiResponse.missingFiles.length === 0 ? (
                  <li className="plan__muted">None</li>
                ) : (
                  model.aiResponse.missingFiles.map((path) => (
                    <li key={path} className="run-inspector__pill run-inspector__pill--warn">
                      {path}
                    </li>
                  ))
                )}
              </ul>
            </section>
            <section>
              <h4 className="run-inspector__section-title">
                Malformed / incomplete blocks ({model.aiResponse.malformedBlocks.length})
              </h4>
              <ul className="run-inspector__pill-list">
                {model.aiResponse.malformedBlocks.length === 0 ? (
                  <li className="plan__muted">None</li>
                ) : (
                  model.aiResponse.malformedBlocks.map((path) => (
                    <li key={path} className="run-inspector__pill run-inspector__pill--warn">
                      {path}
                    </li>
                  ))
                )}
              </ul>
            </section>
            <section>
              <h4 className="run-inspector__section-title">Parser diagnostics</h4>
              <dl className="run-inspector__metrics">
                <div>
                  <dt>Raw response length</dt>
                  <dd>{model.aiResponse.rawResponseLength ?? "—"}</dd>
                </div>
                <div>
                  <dt>Patterns attempted</dt>
                  <dd>
                    {model.aiResponse.parserPatternsAttempted.length > 0
                      ? model.aiResponse.parserPatternsAttempted.join(", ")
                      : "—"}
                  </dd>
                </div>
                <div>
                  <dt>Repair attempted</dt>
                  <dd>{model.aiResponse.repairAttempted ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt>Repair succeeded</dt>
                  <dd>{model.aiResponse.repairSucceeded ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt>Fallback skeleton</dt>
                  <dd>{model.aiResponse.fallbackSkeletonCreated ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt>Backup attempted</dt>
                  <dd>{model.aiResponse.backupProviderAttempted ? "Yes" : "No"}</dd>
                </div>
                <div>
                  <dt>Backup used</dt>
                  <dd>{model.aiResponse.backupProviderUsed ?? "—"}</dd>
                </div>
                <div>
                  <dt>Backup failure</dt>
                  <dd>{model.aiResponse.backupProviderFailureReason ?? "—"}</dd>
                </div>
              </dl>
              {Object.keys(model.aiResponse.parserFailureReasons).length > 0 ? (
                <ul className="run-inspector__warnings">
                  {Object.entries(model.aiResponse.parserFailureReasons).map(([pattern, reason]) => (
                    <li key={pattern}>
                      <code>{pattern}</code>: {reason}
                    </li>
                  ))}
                </ul>
              ) : null}
            </section>
            <section>
              <h4 className="run-inspector__section-title">Provider delivery</h4>
              <dl className="run-inspector__metrics">
                <div>
                  <dt>Request sent</dt>
                  <dd>{model.aiResponse.providerRequestSent ? "Yes" : "No"}</dd>
                </div>
                {model.aiResponse.exactFailureStage ? (
                  <div>
                    <dt>Failure stage</dt>
                    <dd>{model.aiResponse.exactFailureStage}</dd>
                  </div>
                ) : null}
                {model.aiResponse.exactProviderError ? (
                  <div>
                    <dt>Provider / parse error</dt>
                    <dd>{model.aiResponse.exactProviderError}</dd>
                  </div>
                ) : null}
              </dl>
              {model.aiResponse.retryFailoverNotes.length > 0 ? (
                <ul className="run-inspector__warnings">
                  {model.aiResponse.retryFailoverNotes.map((note) => (
                    <li key={note}>{note}</li>
                  ))}
                </ul>
              ) : null}
            </section>
            <section>
              <h4 className="run-inspector__section-title">Parse warnings</h4>
              {model.aiResponse.warnings.length === 0 ? (
                <p className="plan__muted">No parse warnings.</p>
              ) : (
                <ul className="run-inspector__warnings">
                  {model.aiResponse.warnings.map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        ) : null}

        {activeTab === "diffs" ? (
          <FileDiffSection
            diffs={model.fileDiffs}
            selectedPath={diffFocusPath}
            onSelectPath={setDiffFocusPath}
          />
        ) : null}

        {activeTab === "metrics" ? (
          <>
            {model.preflight ? (
              <dl className="run-inspector__metrics run-inspector__preflight">
                <div>
                  <dt>Preflight gate</dt>
                  <dd>{model.preflight.gate ?? "—"}</dd>
                </div>
                <div>
                  <dt>Provider call attempted</dt>
                  <dd>{model.preflight.providerCallAttempted ? "true" : "false"}</dd>
                </div>
                <div>
                  <dt>Skip reason</dt>
                  <dd>{model.preflight.skipReason ?? "—"}</dd>
                </div>
                <div>
                  <dt>Provider blocked reason</dt>
                  <dd>{model.preflight.providerBlockedReason ?? "—"}</dd>
                </div>
                <div>
                  <dt>Route</dt>
                  <dd>{model.preflight.route ?? model.route ?? "—"}</dd>
                </div>
                <div>
                  <dt>Editable files</dt>
                  <dd>{model.preflight.editableFilesCount}</dd>
                </div>
                <div>
                  <dt>Target files</dt>
                  <dd>{model.preflight.targetFilesCount}</dd>
                </div>
                <div>
                  <dt>Fallback eligible</dt>
                  <dd>{model.preflight.fallbackEligible ? "true" : "false"}</dd>
                </div>
                <div>
                  <dt>Fallback attempted</dt>
                  <dd>{model.preflight.fallbackAttempted ? "true" : "false"}</dd>
                </div>
                <div>
                  <dt>Fallback used</dt>
                  <dd>{model.preflight.fallbackUsed ? "true" : "false"}</dd>
                </div>
                <div>
                  <dt>Fallback not used reason</dt>
                  <dd>{model.preflight.fallbackNotUsedReason ?? "—"}</dd>
                </div>
                <div>
                  <dt>Prompt classification</dt>
                  <dd>{model.preflight.promptClassification}</dd>
                </div>
              </dl>
            ) : null}
            {model.apply ? (
              <dl className="run-inspector__metrics run-inspector__apply">
                <div>
                  <dt>Planned files</dt>
                  <dd>{model.apply.plannedFiles.join(", ") || "—"}</dd>
                </div>
                <div>
                  <dt>Allowed files</dt>
                  <dd>{model.apply.allowedFiles.join(", ") || "—"}</dd>
                </div>
                <div>
                  <dt>Rejected files</dt>
                  <dd>{model.apply.rejectedFiles.join(", ") || "—"}</dd>
                </div>
                <div>
                  <dt>Patch generation provider calls</dt>
                  <dd>{model.apply.patchGenerationProviderCalls}</dd>
                </div>
                <div>
                  <dt>Budget max / used / remaining</dt>
                  <dd>
                    {model.apply.budgetMax ?? "—"} / {model.apply.budgetUsed ?? "—"} /{" "}
                    {model.apply.budgetRemaining ?? "—"}
                  </dd>
                </div>
                <div>
                  <dt>Budget exceeded</dt>
                  <dd>{model.apply.budgetExceeded ? "true" : "false"}</dd>
                </div>
                <div>
                  <dt>Budget exceeded reason</dt>
                  <dd>{model.apply.budgetExceededReason ?? "—"}</dd>
                </div>
                <div>
                  <dt>Patch proposal count</dt>
                  <dd>{model.apply.patchProposalCount}</dd>
                </div>
                <div>
                  <dt>Deterministic fallback used</dt>
                  <dd>{model.apply.deterministicFallbackUsed ? "true" : "false"}</dd>
                </div>
                <div>
                  <dt>Apply fallback note</dt>
                  <dd>{model.apply.applyFallbackNote ?? "—"}</dd>
                </div>
              </dl>
            ) : null}
            {(model.metrics.dependencyRepairs.length > 0 ||
              model.metrics.npmInstallRetried) ? (
              <section className="run-inspector__npm-deps" data-testid="npm-dependency-repairs">
                <h4 className="run-inspector__section-title">npm dependency repairs</h4>
                <dl className="run-inspector__metrics">
                  <div>
                    <dt>Install retried after repair</dt>
                    <dd>{model.metrics.npmInstallRetried ? "yes" : "no"}</dd>
                  </div>
                </dl>
                {model.metrics.dependencyRepairs.length > 0 ? (
                  <ul className="run-inspector__warnings">
                    {model.metrics.dependencyRepairs.map((repair) => (
                      <li key={repair}>{repair}</li>
                    ))}
                  </ul>
                ) : (
                  <p className="plan__muted">No package.json changes recorded.</p>
                )}
              </section>
            ) : null}
            <dl className="run-inspector__metrics">
            <div>
              <dt>Duration</dt>
              <dd>{model.metrics.durationLabel}</dd>
            </div>
            <div>
              <dt>Tokens (estimated)</dt>
              <dd>
                {model.metrics.tokensEstimated ?? "—"}
                {model.metrics.promptTokens != null && model.metrics.responseTokens != null
                  ? ` (${model.metrics.promptTokens} prompt + ${model.metrics.responseTokens} response)`
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Files created</dt>
              <dd>{model.metrics.filesCreated}</dd>
            </div>
            <div>
              <dt>Files modified</dt>
              <dd>{model.metrics.filesModified}</dd>
            </div>
            <div>
              <dt>Commands run</dt>
              <dd>{model.metrics.commandsRun.join(", ") || "—"}</dd>
            </div>
            <div>
              <dt>Provider</dt>
              <dd>{model.metrics.provider ?? "—"}</dd>
            </div>
            <div>
              <dt>Model</dt>
              <dd>{model.metrics.model ?? "—"}</dd>
            </div>
            <div>
              <dt>AI calls</dt>
              <dd>
                {model.metrics.aiCallMax != null
                  ? `${model.metrics.aiCalls}/${model.metrics.aiCallMax}`
                  : model.metrics.aiCalls}
              </dd>
            </div>
            {model.metrics.aiCallUsage.length > 0 ? (
              <div className="run-inspector__metrics-wide">
                <dt>AI call sequence</dt>
                <dd>
                  <ul className="run-inspector__warnings">
                    {model.metrics.aiCallUsage.map((entry) => (
                      <li key={`${entry.index}-${entry.stage}-${entry.provider}`}>
                        {entry.summary} · {entry.provider} · {entry.ok ? "ok" : "failed"}
                      </li>
                    ))}
                  </ul>
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Project Memory injected</dt>
              <dd data-testid="run-inspector-memory-injected">
                {model.metrics.memoryInjected ? "yes" : "no"}
              </dd>
            </div>
            <div>
              <dt>Memory context size</dt>
              <dd>{model.metrics.memoryContextSize ?? "—"}</dd>
            </div>
            <div>
              <dt>Memory recommendation used</dt>
              <dd>{model.metrics.memoryRecommendationUsed ? "yes" : "no"}</dd>
            </div>
            <div>
              <dt>Estimated input tokens</dt>
              <dd>
                {model.metrics.estimatedInputTokens ?? "—"}
                {model.metrics.costIsEstimated && model.metrics.estimatedInputTokens != null
                  ? " (est.)"
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Estimated output tokens</dt>
              <dd>
                {model.metrics.estimatedOutputTokens ?? "—"}
                {model.metrics.costIsEstimated && model.metrics.estimatedOutputTokens != null
                  ? " (est.)"
                  : ""}
              </dd>
            </div>
            <div>
              <dt>Estimated cost (USD)</dt>
              <dd>
                {model.metrics.estimatedCostUsd != null
                  ? `$${model.metrics.estimatedCostUsd.toFixed(model.metrics.estimatedCostUsd < 0.01 ? 4 : 2)}`
                  : "—"}
              </dd>
            </div>
            </dl>
          </>
        ) : null}
      </div>
    </div>
  );
}
