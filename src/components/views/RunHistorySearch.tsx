import { useMemo, useState, type MouseEvent } from "react";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import { greenfieldSnapshotFromArtifact } from "@/core/agent/artifactObservability";
import { RUN_OUTCOMES, runHistoryOutcomeLabel } from "@/core/agent/runHistoryOutcome";
import type { RunOutcome } from "@/core/agent/runOutcome";
import { outcomeLabel } from "@/core/agent/runOutcome";
import { computeRunHealth, formatRunHealthLabel, runHealthClassName } from "@/core/agent/runHealth";
import { formatGreenfieldElapsed } from "@/core/agent/greenfieldRunProgress";
import { readProjectMemoryInjectionMeta } from "@/core/projectIntelligence/buildProjectMemoryContext";
import { searchAgentRuns } from "@/core/agent/searchAgentRuns";
import {
  buildDiagnosticReport,
  diagnosticStatusLabel,
  type DiagnosticReportBundle,
} from "@/core/diagnostics/diagnosticReport";
import {
  copyDiagnosticReportText,
  resolveDiagnosticReportBundle,
} from "@/core/diagnostics/diagnosticReport";
import { DiagnosticReportActions } from "@/components/views/DiagnosticReportActions";
import { RunInspectorActions } from "@/components/views/RunInspectorActions";
import { useWorkspace } from "@/app/WorkspaceProvider";

interface RunHistorySearchProps {
  readonly history: readonly AgentRunArtifact[];
  readonly activeRunId: string | null;
  readonly selectedRunId: string | null;
  readonly compareRunIds?: readonly string[];
  readonly onSelectRun: (runId: string | null) => void;
  readonly onToggleCompareRun?: (runId: string) => void;
  readonly onCompareRuns?: () => void;
  readonly onScrollToRun?: (runId: string) => void;
  readonly projectPath?: string | null;
}

const RECENT_RUN_LIMIT = 8;

function recentRuns(history: readonly AgentRunArtifact[]): AgentRunArtifact[] {
  return [...history]
    .sort((a, b) => b.endedAt - a.endedAt)
    .slice(0, RECENT_RUN_LIMIT);
}

function historyStatusLabel(run: AgentRunArtifact): string {
  if (run.diagnosticReport?.status) {
    return diagnosticStatusLabel(run.diagnosticReport.status);
  }
  return runHistoryOutcomeLabel(run.outcome);
}

function providerModelLabel(run: AgentRunArtifact): string | null {
  const provider = run.provider ?? run.card.provider;
  const model = run.model ?? run.card.model;
  if (provider && model) return `${provider} · ${model}`;
  if (provider) return provider;
  if (model) return model;
  return run.card.providerIdentityLine ?? run.card.providerLine;
}

function bundleForRun(run: AgentRunArtifact): DiagnosticReportBundle | null {
  if (run.diagnosticReport && run.diagnosticText) {
    return {
      snapshot: run.diagnosticReport,
      text: run.diagnosticText,
      json: JSON.stringify(run.diagnosticReport, null, 2),
    };
  }
  return buildDiagnosticReport({
    runId: run.runId,
    previousRunId: run.previousRunId ?? null,
    prompt: run.prompt,
    outcome: run.outcome,
    route: run.timeline?.route ?? null,
    generationMode: run.card.title.includes("Creating app") ? "greenfield" : null,
    projectPath: null,
    greenfieldRun: greenfieldSnapshotFromArtifact(run),
    card: run.card,
    timestamp: run.endedAt,
  });
}

export function RunHistorySearch({
  history,
  activeRunId,
  selectedRunId,
  compareRunIds = [],
  onSelectRun,
  onToggleCompareRun,
  onCompareRuns,
  onScrollToRun,
  projectPath = null,
}: RunHistorySearchProps) {
  const { openDiagnosticReport, openRunInspector } = useWorkspace();
  const [query, setQuery] = useState("");
  const [outcomeFilter, setOutcomeFilter] = useState<RunOutcome | "">("");
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const matches = useMemo(
    () =>
      searchAgentRuns(
        history,
        query,
        outcomeFilter === "" ? null : outcomeFilter,
      ),
    [history, query, outcomeFilter],
  );

  const handleSelect = (runId: string) => {
    onSelectRun(selectedRunId === runId ? null : runId);
    onScrollToRun?.(runId);
    setQuery("");
  };

  const showFilteredResults = query.trim().length > 0 || outcomeFilter !== "";
  const displayRuns = useMemo((): AgentRunArtifact[] => {
    if (showFilteredResults) return matches.map((match) => match.run);
    return recentRuns(history);
  }, [showFilteredResults, matches, history]);
  const showResultsList = showFilteredResults || history.length > 0;

  const handleCopyReport = async (run: AgentRunArtifact, event: MouseEvent) => {
    event.stopPropagation();
    const bundle = bundleForRun(run);
    if (!bundle) return;
    const ok = await copyDiagnosticReportText(bundle.text);
    setCopyNote(ok ? "Copied" : "Copy failed");
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  return (
    <div className="run-history-search" data-testid="run-history-search">
      <label className="run-history-search__label visually-hidden" htmlFor="run-history-search-input">
        Search runs
      </label>
      <div className="run-history-search__controls">
        <input
          id="run-history-search-input"
          type="search"
          className="run-history-search__input"
          placeholder="Search runs… (⌘⇧P → Search runs)"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-describedby={displayRuns.length > 0 ? "run-history-search-results" : undefined}
        />
        <select
          className="run-history-search__filter"
          aria-label="Filter by outcome"
          value={outcomeFilter}
          onChange={(event) =>
            setOutcomeFilter(event.target.value as RunOutcome | "")
          }
        >
          <option value="">All outcomes</option>
          {RUN_OUTCOMES.map((outcome) => (
            <option key={outcome} value={outcome}>
              {outcomeLabel(outcome)}
            </option>
          ))}
        </select>
        {compareRunIds.length === 2 && onCompareRuns ? (
          <button
            type="button"
            className="prov-btn run-history-search__compare"
            data-testid="compare-runs-button"
            onClick={onCompareRuns}
          >
            Compare Runs
          </button>
        ) : null}
      </div>
      {copyNote ? <p className="plan__muted run-history-search__copy-note">{copyNote}</p> : null}
      {showResultsList ? (
        <>
          {!showFilteredResults && history.length > 0 ? (
            <p className="run-history-search__recent-label plan__muted">Recent runs</p>
          ) : null}
          <ul id="run-history-search-results" className="run-history-search__results">
            {displayRuns.length === 0 ? (
              <li className="run-history-search__empty">
                {showFilteredResults ? "No runs match your search." : "No runs yet."}
              </li>
            ) : (
              displayRuns.map((run) => {
                const expanded = expandedRunId === run.runId;
                const bundle = expanded ? bundleForRun(run) : null;
                const compareSelected = compareRunIds.includes(run.runId);
                const health = computeRunHealth({ artifact: run });
                const memoryUsed = Boolean(
                  readProjectMemoryInjectionMeta({
                    entries: run.logEntries ?? [],
                    projectMemoryInjection: null,
                  })?.injected,
                );
                const providerModel = providerModelLabel(run);
                const filesChanged = run.filesModified.length;
                return (
                  <li key={run.runId} className="run-history-search__item">
                    {onToggleCompareRun ? (
                      <label className="run-history-search__compare-check">
                        <input
                          type="checkbox"
                          checked={compareSelected}
                          aria-label={`Compare run #${run.runNumber}`}
                          onChange={() => onToggleCompareRun(run.runId)}
                        />
                      </label>
                    ) : null}
                    <button
                      type="button"
                      className={[
                        "run-history-card",
                        run.runId === activeRunId ? "run-history-card--active" : "",
                        run.runId === selectedRunId ? "run-history-card--selected" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      onClick={() => handleSelect(run.runId)}
                    >
                      <div className="run-history-card__top">
                        <span className="run-history-card__number">Run #{run.runNumber}</span>
                        <span
                          className={`run-history-search__badge run-history-search__badge--${run.outcome}`}
                        >
                          {historyStatusLabel(run)}
                        </span>
                        <span
                          className={`run-history-search__health ${runHealthClassName(health.tone)}`}
                          title={formatRunHealthLabel(health)}
                        >
                          {health.score}
                        </span>
                        {memoryUsed ? (
                          <span
                            className="run-history-search__memory-badge"
                            title="Project memory context was injected"
                          >
                            Memory
                          </span>
                        ) : null}
                      </div>
                      <p className="run-history-card__prompt">{run.prompt}</p>
                      <div className="run-history-card__meta">
                        {filesChanged > 0 ? <span>{filesChanged} files changed</span> : null}
                        {providerModel ? <span>{providerModel}</span> : null}
                        <span>{formatGreenfieldElapsed(run.durationMs)}</span>
                      </div>
                      <div className="run-history-card__actions">
                        <button
                          type="button"
                          className="prov-btn prov-btn--compact"
                          onClick={(event) => {
                            event.stopPropagation();
                            openRunInspector(run.runId);
                          }}
                        >
                          Inspect
                        </button>
                        <button
                          type="button"
                          className="prov-btn prov-btn--compact"
                          onClick={(event) => {
                            event.stopPropagation();
                            const resolved = resolveDiagnosticReportBundle({
                              runId: run.runId,
                              previousRunId: run.previousRunId ?? null,
                              prompt: run.prompt,
                              card: run.card,
                              greenfieldRun: greenfieldSnapshotFromArtifact(run),
                              artifact: run,
                              outcome: run.outcome,
                              projectPath,
                              route: run.timeline?.route ?? null,
                              generationMode: run.card.title.includes("Creating app")
                                ? "greenfield"
                                : null,
                            });
                            if (resolved) {
                              openDiagnosticReport({
                                runId: run.runId,
                                bundle: resolved,
                                metadata: {
                                  runId: run.runId,
                                  previousRunId: run.previousRunId ?? null,
                                  prompt: run.prompt,
                                  projectPath,
                                  route: run.timeline?.route ?? null,
                                  generationMode: run.card.title.includes("Creating app")
                                    ? "greenfield"
                                    : null,
                                },
                              });
                            }
                          }}
                        >
                          Diagnostics
                        </button>
                        <button
                          type="button"
                          className="prov-btn prov-btn--compact"
                          onClick={(event) => void handleCopyReport(run, event)}
                        >
                          Copy Report
                        </button>
                        <button
                          type="button"
                          className="build-view__link run-history-search__expand"
                          aria-expanded={expanded}
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedRunId(expanded ? null : run.runId);
                          }}
                        >
                          {expanded ? "Hide details" : "More"}
                        </button>
                      </div>
                    </button>
                    {expanded && bundle ? (
                      <div className="run-history-search__diagnostics">
                        <p className="run-history-search__diag-line">
                          Status: {diagnosticStatusLabel(bundle.snapshot.status)}
                        </p>
                        <p className="run-history-search__diag-line plan__muted">
                          {bundle.snapshot.errorCategoryLabel ??
                            bundle.snapshot.errorMessage ??
                            "No error recorded."}
                        </p>
                        <DiagnosticReportActions
                          runId={run.runId}
                          previousRunId={run.previousRunId ?? null}
                          prompt={run.prompt}
                          card={run.card}
                          greenfieldRun={greenfieldSnapshotFromArtifact(run)}
                          artifact={run}
                          outcome={run.outcome}
                          projectPath={projectPath}
                          route={run.timeline?.route ?? null}
                          compact
                        />
                        <RunInspectorActions runId={run.runId} compact />
                      </div>
                    ) : null}
                  </li>
                );
              })
            )}
          </ul>
        </>
      ) : null}
      {activeRunId && !selectedRunId ? (
        <p className="run-history-search__live plan__muted" role="status">
          Live run in progress
        </p>
      ) : null}
      {selectedRunId ? (
        <button type="button" className="build-view__link run-history-search__live" onClick={() => onSelectRun(null)}>
          Back to live
        </button>
      ) : null}
    </div>
  );
}
