import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { GreenfieldRunLogEntry } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { StudioRunSummary } from "@/core/studioRun/summary";
import {
  buildRunLogSummarySection,
  filterRunLogEntries,
  formatDurationMs,
  formatRunLogSummaryCompact,
  formatRunLogTime,
  isRunLogActive,
  parseRunLogEntryDetails,
  persistRunLogSummaryOpenPreference,
  readRunLogSummaryOpenPreference,
  runStatusBadgeClass,
  type RunLogFilter,
} from "@/core/studioRun/runLogInspectorModel";

const DETAILS_HEIGHT_KEY = "bryantlabs-studio-run-log-details-height";
const DEFAULT_DETAILS_HEIGHT = 220;
const FILTER_OPTIONS: { id: RunLogFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "running", label: "Running" },
  { id: "success", label: "Success" },
  { id: "warning", label: "Warning" },
  { id: "failed", label: "Failed" },
];

export interface StudioRunLogInspectorProps {
  readonly title?: string;
  readonly entries: readonly GreenfieldRunLogEntry[];
  readonly snapshot: GreenfieldRunSnapshot;
  readonly summary: StudioRunSummary;
  readonly autoScroll?: boolean;
  readonly onCopyLogs?: () => void | Promise<void>;
  readonly onCopyDebug?: () => void | Promise<void>;
  readonly copyNote?: string | null;
  readonly banner?: ReactNode;
}

function loadDetailsHeight(): number {
  try {
    const raw = localStorage.getItem(DETAILS_HEIGHT_KEY);
    const n = raw ? Number(raw) : DEFAULT_DETAILS_HEIGHT;
    return Number.isFinite(n) ? Math.max(120, Math.min(480, n)) : DEFAULT_DETAILS_HEIGHT;
  } catch {
    return DEFAULT_DETAILS_HEIGHT;
  }
}

export function StudioRunLogInspector({
  title = "Studio run log",
  entries,
  snapshot,
  summary,
  autoScroll = false,
  onCopyLogs,
  onCopyDebug,
  copyNote = null,
  banner = null,
}: StudioRunLogInspectorProps) {
  const [filter, setFilter] = useState<RunLogFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(() =>
    readRunLogSummaryOpenPreference(isRunLogActive(summary)),
  );
  const [diagnosticsExpanded, setDiagnosticsExpanded] = useState(true);
  const [followTail, setFollowTail] = useState(autoScroll);
  const [detailsHeight, setDetailsHeight] = useState(loadDetailsHeight);
  const [showLatestPill, setShowLatestPill] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const tailRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ startY: number; startHeight: number } | null>(null);
  const runStartedAtRef = useRef(snapshot.runStartedAt);

  const summarySection = useMemo(
    () => buildRunLogSummarySection(snapshot, summary),
    [snapshot, summary],
  );

  const summaryCompactLine = useMemo(
    () => formatRunLogSummaryCompact(summarySection),
    [summarySection],
  );

  const toggleSummaryOpen = useCallback(() => {
    setSummaryOpen((open) => {
      const next = !open;
      persistRunLogSummaryOpenPreference(next);
      return next;
    });
  }, []);

  useEffect(() => {
    if (snapshot.runStartedAt === runStartedAtRef.current) return;
    runStartedAtRef.current = snapshot.runStartedAt;
    if (!isRunLogActive(summary)) return;
    setSummaryOpen(false);
    persistRunLogSummaryOpenPreference(false);
  }, [snapshot.runStartedAt, summary.runResult]);

  const filtered = useMemo(
    () => filterRunLogEntries(entries, filter, search),
    [entries, filter, search],
  );

  const selectedEntry = useMemo(
    () => entries.find((e) => e.id === selectedId) ?? null,
    [entries, selectedId],
  );

  const selectedDetails = useMemo(
    () => (selectedEntry ? parseRunLogEntryDetails(selectedEntry, summary) : null),
    [selectedEntry, summary],
  );

  const scrollToBottom = useCallback((behavior: ScrollBehavior = "smooth") => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTo({ top: el.scrollHeight, behavior });
    setFollowTail(true);
    setShowLatestPill(false);
  }, []);

  useEffect(() => {
    if (autoScroll) setFollowTail(true);
  }, [autoScroll]);

  useEffect(() => {
    if (selectedId) return;
    const latestFailed = [...entries].reverse().find((e) => e.status === "failed");
    if (latestFailed) setSelectedId(latestFailed.id);
  }, [entries, selectedId]);

  useEffect(() => {
    if (!followTail) return;
    scrollToBottom("auto");
  }, [entries.length, filtered.length, followTail, scrollToBottom]);

  const onTimelineScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    setFollowTail(nearBottom);
    setShowLatestPill(!nearBottom && entries.length > 0);
  };

  const startResize = (event: React.MouseEvent) => {
    event.preventDefault();
    dragRef.current = { startY: event.clientY, startHeight: detailsHeight };
    const onMove = (moveEvent: MouseEvent) => {
      if (!dragRef.current) return;
      const delta = dragRef.current.startY - moveEvent.clientY;
      const next = Math.max(120, Math.min(480, dragRef.current.startHeight + delta));
      setDetailsHeight(next);
    };
    const onUp = () => {
      dragRef.current = null;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setDetailsHeight((h) => {
        try {
          localStorage.setItem(DETAILS_HEIGHT_KEY, String(h));
        } catch {
          /* ignore */
        }
        return h;
      });
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const durationLabel = formatDurationMs(summary.totalDurationMs ?? 0);

  return (
    <div className="studio-run-log" data-testid="studio-run-log-inspector">
      {banner}

      <header className="studio-run-log__header">
        <div className="studio-run-log__header-primary">
          <h3 className="studio-run-log__title">{title}</h3>
          <div className="studio-run-log__badges">
            <span
              className={`studio-run-log__badge ${runStatusBadgeClass(summary.runResult)}`}
            >
              {summary.runResult}
            </span>
            {summary.provider ? (
              <span className="studio-run-log__badge studio-run-log__badge--neutral">
                {summary.provider}
              </span>
            ) : null}
            {summary.model ? (
              <span className="studio-run-log__badge studio-run-log__badge--neutral">
                {summary.model}
              </span>
            ) : null}
            <span className="studio-run-log__badge studio-run-log__badge--neutral">
              {durationLabel}
            </span>
          </div>
        </div>
        <div className="studio-run-log__header-actions">
          {onCopyLogs ? (
            <button type="button" className="prov-btn prov-btn--sm" onClick={() => void onCopyLogs()}>
              Copy logs
            </button>
          ) : null}
          {onCopyDebug ? (
            <button type="button" className="prov-btn prov-btn--sm" onClick={() => void onCopyDebug()}>
              Copy debug report
            </button>
          ) : null}
          {copyNote ? <span className="studio-run-log__copynote">{copyNote}</span> : null}
        </div>
      </header>

      <div className="studio-run-log__toolbar">
        <input
          type="search"
          className="studio-run-log__search"
          placeholder="Filter log…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Search run log"
        />
        <div className="studio-run-log__filters" role="group" aria-label="Log filters">
          {FILTER_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              type="button"
              className={`studio-run-log__chip${filter === opt.id ? " studio-run-log__chip--active" : ""}`}
              onClick={() => setFilter(opt.id)}
            >
              {opt.label}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="studio-run-log__toolbar-btn"
          onClick={() => setDiagnosticsExpanded((o) => !o)}
        >
          {diagnosticsExpanded ? "Collapse details" : "Expand details"}
        </button>
        {showLatestPill || !followTail ? (
          <button
            type="button"
            className="studio-run-log__jump-btn"
            onClick={() => scrollToBottom()}
          >
            Jump to latest
          </button>
        ) : null}
      </div>

      <section
        className={`studio-run-log__summary${summaryOpen ? "" : " studio-run-log__summary--collapsed"}`}
        aria-label="Run summary"
      >
        <div className="studio-run-log__summary-bar">
          {summaryOpen ? (
            <span className="studio-run-log__summary-title">Run summary</span>
          ) : (
            <p className="studio-run-log__summary-compact" title={summarySection.prompt ?? undefined}>
              {summaryCompactLine}
            </p>
          )}
          <button
            type="button"
            className="studio-run-log__summary-toggle"
            aria-expanded={summaryOpen}
            onClick={toggleSummaryOpen}
          >
            {summaryOpen ? "Collapse summary" : "Expand summary"}
          </button>
        </div>
        {summaryOpen ? (
          <dl className="studio-run-log__summary-grid">
            <div>
              <dt>Prompt</dt>
              <dd className="studio-run-log__summary-prompt">{summarySection.prompt ?? "—"}</dd>
            </div>
            <div>
              <dt>Files proposed</dt>
              <dd>{summarySection.filesProposed ?? "—"}</dd>
            </div>
            <div>
              <dt>Files modified</dt>
              <dd>{summarySection.filesModified ?? "—"}</dd>
            </div>
            <div>
              <dt>Files written</dt>
              <dd>{summarySection.filesWritten}</dd>
            </div>
            <div>
              <dt>Build</dt>
              <dd>{summarySection.buildResult ?? "—"}</dd>
            </div>
            <div>
              <dt>TypeScript</dt>
              <dd>{summarySection.typescriptResult ?? "—"}</dd>
            </div>
            <div>
              <dt>Preview</dt>
              <dd>{summarySection.previewResult ?? "—"}</dd>
            </div>
            <div>
              <dt>AI calls</dt>
              <dd>{summarySection.totalAiCalls ?? "—"}</dd>
            </div>
            <div>
              <dt>Budget</dt>
              <dd>
                {summarySection.budget.used ?? "—"}/{summarySection.budget.max ?? "—"}
                {summarySection.budget.remaining != null
                  ? ` (${summarySection.budget.remaining} left)`
                  : ""}
              </dd>
            </div>
            {summarySection.commandsRun.length > 0 ? (
              <div className="studio-run-log__summary-wide">
                <dt>Commands</dt>
                <dd>{summarySection.commandsRun.join(" · ")}</dd>
              </div>
            ) : null}
          </dl>
        ) : null}
      </section>

      <div className="studio-run-log__main">
        <div
          ref={scrollRef}
          className="studio-run-log__timeline"
          onScroll={onTimelineScroll}
          role="log"
          aria-label="Run timeline"
        >
          {filtered.length === 0 ? (
            <p className="studio-run-log__empty">
              {entries.length === 0
                ? "Live steps appear here when Studio runs any workflow."
                : "No log entries match the current filter."}
            </p>
          ) : (
            <table className="studio-run-log__table">
              <thead>
                <tr>
                  <th scope="col">Time</th>
                  <th scope="col">Stage</th>
                  <th scope="col">Status</th>
                  <th scope="col">Message</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((entry) => {
                  const active = entry.id === selectedId;
                  return (
                    <tr
                      key={entry.id}
                      className={`studio-run-log__row studio-run-log__row--${entry.status}${active ? " studio-run-log__row--selected" : ""}`}
                      onClick={() => setSelectedId(entry.id)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedId(entry.id);
                        }
                      }}
                    >
                      <td className="studio-run-log__col-time">{formatRunLogTime(entry.timestamp)}</td>
                      <td className="studio-run-log__col-stage">
                        {parseRunLogEntryDetails(entry, summary).stageLabel}
                      </td>
                      <td className="studio-run-log__col-status">
                        <span className={`studio-run-log__status studio-run-log__status--${entry.status}`}>
                          {entry.status}
                        </span>
                      </td>
                      <td className="studio-run-log__col-message">{entry.message}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <div ref={tailRef} className="studio-run-log__tail" aria-hidden />
        </div>

        {selectedDetails && diagnosticsExpanded ? (
          <>
            <div
              className="studio-run-log__splitter"
              role="separator"
              aria-orientation="horizontal"
              onMouseDown={startResize}
            />
            <aside
              className="studio-run-log__details"
              style={{ height: detailsHeight }}
              aria-label="Log entry details"
            >
              <header className="studio-run-log__details-head">
                <strong>{selectedDetails.stageLabel}</strong>
                <span className={`studio-run-log__status studio-run-log__status--${selectedDetails.entry.status}`}>
                  {selectedDetails.entry.status}
                </span>
                <span className="studio-run-log__details-time">
                  {formatRunLogTime(selectedDetails.entry.timestamp)}
                </span>
              </header>

              <p className="studio-run-log__details-message">{selectedDetails.entry.message}</p>

              {selectedDetails.planner ? (
                <section className="studio-run-log__planner-diag">
                  <h4>Planner output preview</h4>
                  <dl className="studio-run-log__kv">
                    <div>
                      <dt>Provider</dt>
                      <dd>{selectedDetails.planner.provider ?? summary.provider ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Model</dt>
                      <dd>{selectedDetails.planner.model ?? summary.model ?? "—"}</dd>
                    </div>
                    {selectedDetails.planner.responseLength != null ? (
                      <div>
                        <dt>Response length</dt>
                        <dd>{selectedDetails.planner.responseLength}</dd>
                      </div>
                    ) : null}
                    {selectedDetails.planner.candidateCount != null ? (
                      <div>
                        <dt>Candidates</dt>
                        <dd>{selectedDetails.planner.candidateCount}</dd>
                      </div>
                    ) : null}
                    {selectedDetails.planner.finishReason ? (
                      <div>
                        <dt>Finish reason</dt>
                        <dd>{selectedDetails.planner.finishReason}</dd>
                      </div>
                    ) : null}
                    {selectedDetails.planner.safetyBlocked != null ? (
                      <div>
                        <dt>Safety blocked</dt>
                        <dd>{selectedDetails.planner.safetyBlocked ? "yes" : "no"}</dd>
                      </div>
                    ) : null}
                    {selectedDetails.planner.repairAttempted != null ? (
                      <div>
                        <dt>JSON repair attempted</dt>
                        <dd>{selectedDetails.planner.repairAttempted ? "yes" : "no"}</dd>
                      </div>
                    ) : null}
                    {selectedDetails.planner.repairSucceeded != null ? (
                      <div>
                        <dt>JSON repair succeeded</dt>
                        <dd>{selectedDetails.planner.repairSucceeded ? "yes" : "no"}</dd>
                      </div>
                    ) : null}
                    {selectedDetails.planner.repairSkippedReason ? (
                      <div className="studio-run-log__kv-wide">
                        <dt>Repair skipped</dt>
                        <dd>{selectedDetails.planner.repairSkippedReason}</dd>
                      </div>
                    ) : null}
                    {selectedDetails.planner.maxOutputTokens != null ? (
                      <div>
                        <dt>Max output tokens</dt>
                        <dd>{selectedDetails.planner.maxOutputTokens}</dd>
                      </div>
                    ) : null}
                    {selectedDetails.planner.thoughtsTokenCount != null ? (
                      <div>
                        <dt>Thoughts tokens</dt>
                        <dd>{selectedDetails.planner.thoughtsTokenCount}</dd>
                      </div>
                    ) : null}
                    {selectedDetails.planner.candidatesTokenCount != null ? (
                      <div>
                        <dt>Candidate tokens</dt>
                        <dd>{selectedDetails.planner.candidatesTokenCount}</dd>
                      </div>
                    ) : null}
                    {selectedDetails.planner.tokenStarvationLikely != null ? (
                      <div>
                        <dt>Token starvation likely</dt>
                        <dd>{selectedDetails.planner.tokenStarvationLikely ? "yes" : "no"}</dd>
                      </div>
                    ) : null}
                    {selectedDetails.planner.tokenBudgetHint ? (
                      <div className="studio-run-log__kv-wide">
                        <dt>Token budget hint</dt>
                        <dd>{selectedDetails.planner.tokenBudgetHint}</dd>
                      </div>
                    ) : null}
                  </dl>
                  {selectedDetails.planner.rawOutput ? (
                    <>
                      <p className="studio-run-log__label">Raw output</p>
                      <pre className="studio-run-log__raw">{selectedDetails.planner.rawOutput}</pre>
                    </>
                  ) : null}
                  {selectedDetails.planner.providerMetadata ? (
                    <>
                      <p className="studio-run-log__label">Provider metadata</p>
                      <pre className="studio-run-log__raw">
                        {selectedDetails.planner.providerMetadata}
                      </pre>
                    </>
                  ) : null}
                  {selectedDetails.planner.rawGeminiResponse &&
                  selectedDetails.planner.rawGeminiResponse !==
                    selectedDetails.planner.providerMetadata ? (
                    <>
                      <p className="studio-run-log__label">Raw Gemini response</p>
                      <pre className="studio-run-log__raw">
                        {selectedDetails.planner.rawGeminiResponse}
                      </pre>
                    </>
                  ) : null}
                  {selectedDetails.planner.usageMetadata ? (
                    <>
                      <p className="studio-run-log__label">Usage metadata</p>
                      <pre className="studio-run-log__raw">
                        {selectedDetails.planner.usageMetadata}
                      </pre>
                    </>
                  ) : null}
                  {selectedDetails.planner.parseFailReason ||
                  selectedDetails.planner.parseError ? (
                    <>
                      <p className="studio-run-log__label studio-run-log__label--failed">Parse failure</p>
                      <pre className="studio-run-log__raw studio-run-log__raw--error">
                        {selectedDetails.planner.parseFailReason
                          ? `${selectedDetails.planner.parseFailReason}: `
                          : ""}
                        {selectedDetails.planner.parseError ?? selectedDetails.planner.error}
                      </pre>
                    </>
                  ) : null}
                </section>
              ) : null}

              {selectedDetails.isProviderFailure ? (
                <section className="studio-run-log__provider-diag">
                  <h4>Provider failure</h4>
                  <dl className="studio-run-log__kv">
                    <div>
                      <dt>Provider</dt>
                      <dd>
                        {selectedDetails.providerCall?.provider ?? summary.provider ?? "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>Model</dt>
                      <dd>{selectedDetails.providerCall?.model ?? summary.model ?? "—"}</dd>
                    </div>
                    <div>
                      <dt>Stage</dt>
                      <dd>
                        {selectedDetails.providerCall?.stage ?? selectedDetails.stageLabel}
                      </dd>
                    </div>
                    <div>
                      <dt>Duration</dt>
                      <dd>
                        {selectedDetails.providerCall?.durationMs
                          ? `${selectedDetails.providerCall.durationMs} ms`
                          : "—"}
                      </dd>
                    </div>
                    {selectedDetails.providerCall?.tokens ? (
                      <div>
                        <dt>Tokens (est.)</dt>
                        <dd>{selectedDetails.providerCall.tokens}</dd>
                      </div>
                    ) : null}
                    {selectedDetails.providerCall?.budget ? (
                      <>
                        <div>
                          <dt>Budget used</dt>
                          <dd>{selectedDetails.providerCall.budget.used ?? "—"}</dd>
                        </div>
                        <div>
                          <dt>Budget remaining</dt>
                          <dd>{selectedDetails.providerCall.budget.remaining ?? "—"}</dd>
                        </div>
                      </>
                    ) : null}
                    <div className="studio-run-log__kv-wide">
                      <dt>Error</dt>
                      <dd>
                        {selectedDetails.providerCall?.failureStatus ??
                          selectedDetails.entry.message}
                      </dd>
                    </div>
                  </dl>
                </section>
              ) : null}

              {selectedDetails.entry.details ? (
                <section className="studio-run-log__raw-section">
                  <h4>Raw diagnostics</h4>
                  <pre className="studio-run-log__raw">{selectedDetails.entry.details}</pre>
                </section>
              ) : null}
            </aside>
          </>
        ) : null}
      </div>

      {followTail && entries.length > 0 ? (
        <div className="studio-run-log__live-pill" aria-live="polite">
          Live · {entries.length} events
        </div>
      ) : null}
    </div>
  );
}
