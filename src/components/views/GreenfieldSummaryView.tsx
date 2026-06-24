import { useMemo, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { useEffectiveGreenfieldRun } from "@/app/workspace/useEffectiveGreenfieldRun";
import { HistoricalRunBanner } from "@/components/views/HistoricalRunBanner";
import { GreenfieldFailureInvestigationPanel } from "@/components/views/GreenfieldFailureInvestigationPanel";
import { GreenfieldTypeScriptDiagnosticsBlock } from "@/components/views/GreenfieldTypeScriptDiagnosticsBlock";
import { resolveStudioFailureReport } from "@/core/diagnostics/failureReport";
import { resolveTypecheckDetails } from "@/core/greenfield/tscDiagnostics";
import { StudioFailureDiagnosticsPanel } from "@/components/views/StudioFailureDiagnosticsPanel";
import { UiAuditFailureDiagnosticsPanel } from "@/components/views/UiAuditFailureDiagnosticsPanel";
import { formatRunTimelineForSummary } from "@/core/agent/runTimeline";
import { deriveRunFailureDetails } from "@/core/agent/runFailureDiagnostics";
import { RunFailureDetailsPanel } from "@/components/views/RunFailureDetailsPanel";
import { buildUiAuditFailureDiagnostics } from "@/core/greenfield/uiAudit/diagnostics";
import {
  buildStudioRunSummary,
  formatStudioSummaryRunLog,
  resolveStudioRunRootFailure,
} from "@/core/studioRun/summary";
/**
 * Center Summary tab — latest Studio action report (any workflow).
 */
export function GreenfieldSummaryView() {
  const { selectAgentRun } = useWorkspace();
  const { snapshot: greenfieldRun, viewingHistorical, selectedArtifact } =
    useEffectiveGreenfieldRun();
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const summary = useMemo(
    () => buildStudioRunSummary(greenfieldRun),
    [greenfieldRun],
  );

  const failureReport = useMemo(
    () =>
      resolveStudioFailureReport({
        failureReport: greenfieldRun.failureReport,
        setupResult: greenfieldRun.setupResult,
        verification: greenfieldRun.verification,
      }),
    [greenfieldRun.failureReport, greenfieldRun.setupResult, greenfieldRun.verification],
  );

  const rootFailure = resolveStudioRunRootFailure(
    greenfieldRun,
    summary,
    failureReport,
  );

  const typecheckDetails = useMemo(
    () =>
      greenfieldRun.setupResult
        ? resolveTypecheckDetails(greenfieldRun.setupResult)
        : undefined,
    [greenfieldRun.setupResult],
  );

  const showTypecheckDiagnostics =
    typecheckDetails !== undefined &&
    greenfieldRun.setupResult?.typecheck !== undefined &&
    !greenfieldRun.setupResult.typecheck.ok;

  const runFailureDetails = useMemo(
    () =>
      summary.runResult === "failed"
        ? deriveRunFailureDetails({
            greenfieldRun,
            failureReport,
            overallFailed: true,
          })
        : null,
    [greenfieldRun, failureReport, summary.runResult],
  );

  const uiAuditFailureDiagnostics = useMemo(
    () =>
      greenfieldRun.uiAuditResult
        ? buildUiAuditFailureDiagnostics(greenfieldRun.uiAuditResult)
        : null,
    [greenfieldRun.uiAuditResult],
  );

  const showFailureInvestigation =
    !viewingHistorical &&
    summary.actionType === "greenfield" &&
    greenfieldRun.setupResult !== null &&
    !greenfieldRun.setupResult.ok &&
    !failureReport;

  const copySummary = async () => {
    try {
      await navigator.clipboard.writeText(
        formatStudioSummaryRunLog(summary, {
          rootFailure,
          typecheckDetails: showTypecheckDiagnostics ? typecheckDetails : null,
          runTimeline: greenfieldRun.runTimeline,
          uiAuditResult: greenfieldRun.uiAuditResult,
          uiAuditHistory: greenfieldRun.uiAuditHistory,
        }),
      );
      setCopyNote("Copied");
    } catch {
      setCopyNote("Copy failed");
    }
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  const hasActivity =
    greenfieldRun.entries.length > 0 ||
    greenfieldRun.actionType !== "idle" ||
    greenfieldRun.genStatus !== "idle";

  if (!hasActivity) {
    return (
      <p className="center-panel__hint">
        Run summary appears here after Studio completes an action.
      </p>
    );
  }

  const showEditingDetails =
    summary.actionType === "apply_plan" ||
    summary.actionType === "ai_patch_propose" ||
    summary.actionType === "ai_patch_apply" ||
    summary.actionType === "safe_edit";

  return (
    <div className="gf-summary">
      {viewingHistorical && selectedArtifact ? (
        <HistoricalRunBanner
          artifact={selectedArtifact}
          onBackToLive={() => selectAgentRun(null)}
        />
      ) : null}
      <div className="gf-summary__head">
        <h3 className="gf-summary__title">Run summary</h3>
        <span className={`gf-summary__badge gf-summary__badge--${summary.runResult}`}>
          {summary.runResult}
        </span>
        <button type="button" className="prov-btn" onClick={() => void copySummary()}>
          Copy summary
        </button>
        {copyNote ? <span className="gf-summary__copynote">{copyNote}</span> : null}
      </div>

      {rootFailure ? (
        <div className="gf-summary__root-failure" role="alert">
          <p className="gf-summary__root-failure-label">Root failure</p>
          <p className="gf-summary__root-failure-msg">{rootFailure}</p>
        </div>
      ) : null}

      {greenfieldRun.runTimeline ? (
        <div className="gf-summary__timeline" role="region" aria-label="Run timeline">
          <p className="gf-summary__timeline-label">Run timeline</p>
          <p className="gf-summary__timeline-meta">
            <span>run_id: {greenfieldRun.runTimeline.runId}</span>
            <span>route: {greenfieldRun.runTimeline.route}</span>
            <span>last stage: {greenfieldRun.runTimeline.lastStage ?? "—"}</span>
            <span>
              last successful: {greenfieldRun.runTimeline.lastSuccessfulStage ?? "—"}
            </span>
          </p>
          <pre className="gf-summary__timeline-pre">
            {formatRunTimelineForSummary(greenfieldRun.runTimeline)
              .slice(1)
              .join("\n")}
          </pre>
        </div>
      ) : null}

      {summary.latestAction ? (
        <div
          className={`gf-summary__latest-action gf-summary__latest-action--${summary.latestAction.status}`}
        >
          <p className="gf-summary__latest-action-label">Latest action</p>
          <p className="gf-summary__latest-action-msg">{summary.latestAction.summary}</p>
          {summary.latestAction.detail &&
          summary.latestAction.detail !== summary.latestAction.summary ? (
            <p className="gf-summary__latest-action-detail">{summary.latestAction.detail}</p>
          ) : null}
        </div>
      ) : null}

      <dl className="gf-summary__card">
        <SummaryRow
          label="Action"
          value={summary.actionLabel}
          highlight
        />
        <SummaryRow
          label="Status"
          value={summary.runResult}
          highlight
          success={summary.runResult === "success"}
          error={summary.runResult === "failed"}
        />
        {summary.latestAction ? (
          <SummaryRow
            label="Latest action"
            value={summary.latestAction.summary}
            error={summary.latestAction.status === "failed"}
          />
        ) : null}
        {summary.previousSuccessfulRunMessage ? (
          <SummaryRow
            label="Previous successful run"
            value={summary.previousSuccessfulRunMessage}
            pre
          />
        ) : null}
        {summary.lastSuccessfulRunAt ? (
          <SummaryRow
            label="Last successful run (time)"
            value={summary.lastSuccessfulRunAt}
          />
        ) : null}
        <SummaryRow label="Provider" value={summary.provider ?? "—"} />
        <SummaryRow label="Model" value={summary.model ?? "—"} />
        <SummaryRow label="Target project" value={summary.targetFolder ?? "—"} mono />
        <SummaryRow
          label="Duration"
          value={
            summary.totalDurationMs !== null
              ? `${summary.totalDurationMs} ms`
              : "—"
          }
        />

        {showEditingDetails && summary.workflowPrompt ? (
          <SummaryRow label="Prompt" value={summary.workflowPrompt} pre />
        ) : null}
        {showEditingDetails && summary.planSource ? (
          <SummaryRow label="Plan source" value={summary.planSource} />
        ) : null}
        {summary.filesProposed !== null ? (
          <SummaryRow label="Files proposed" value={String(summary.filesProposed)} />
        ) : null}
        {summary.filesAccepted !== null ? (
          <SummaryRow label="Files accepted" value={String(summary.filesAccepted)} />
        ) : null}
        {summary.linesAdded !== null || summary.linesRemoved !== null ? (
          <SummaryRow
            label="Lines added / removed"
            value={`+${summary.linesAdded ?? 0} / −${summary.linesRemoved ?? 0}`}
          />
        ) : null}

        {summary.actionType === "greenfield" ? (
          <SummaryRow
            label="Files generated"
            value={
              summary.filesGenerated.length
                ? summary.filesGenerated.join(", ")
                : "—"
            }
          />
        ) : (
          <SummaryRow
            label="Files affected"
            value={
              summary.filesAffected.length
                ? summary.filesAffected.join(", ")
                : "—"
            }
          />
        )}
        <SummaryRow
          label="Files written"
          value={
            summary.filesWritten.length
              ? summary.filesWritten.join(", ")
              : "—"
          }
        />
        <SummaryRow
          label="Commands executed"
          value={
            summary.commandsRun.length
              ? summary.commandsRun.join("\n")
              : "—"
          }
          pre
        />
        <SummaryRow label="TypeScript result" value={summary.typescriptResult ?? "—"} />
        <SummaryRow label="Build result" value={summary.buildResult ?? "—"} />
        <SummaryRow label="Preview result" value={summary.previewResult ?? "—"} />
        <SummaryRow
          label="Errors"
          value={summary.errors.length ? summary.errors.join("\n") : "—"}
          pre
          error={summary.errors.length > 0}
        />
        {summary.previousAttemptErrors.length > 0 ? (
          <SummaryRow
            label="Previous repaired issues"
            value={summary.previousAttemptErrors.join("\n")}
            pre
          />
        ) : null}
      </dl>

      {failureReport && summary.runResult === "failed" ? (
        <StudioFailureDiagnosticsPanel report={failureReport} />
      ) : runFailureDetails && summary.runResult === "failed" ? (
        <RunFailureDetailsPanel details={runFailureDetails} />
      ) : uiAuditFailureDiagnostics && summary.runResult === "failed" ? (
        <UiAuditFailureDiagnosticsPanel diagnostics={uiAuditFailureDiagnostics} />
      ) : showFailureInvestigation && greenfieldRun.setupResult ? (
        <GreenfieldFailureInvestigationPanel
          setupResult={greenfieldRun.setupResult}
          generatedFiles={greenfieldRun.generatedFiles}
          targetFolder={greenfieldRun.targetFolder}
          headline={rootFailure}
        />
      ) : showTypecheckDiagnostics && typecheckDetails ? (
        <GreenfieldTypeScriptDiagnosticsBlock details={typecheckDetails} />
      ) : null}
    </div>
  );
}

function SummaryRow({
  label,
  value,
  mono,
  pre,
  highlight,
  error,
  success,
}: {
  label: string;
  value: string;
  mono?: boolean;
  pre?: boolean;
  highlight?: boolean;
  error?: boolean;
  success?: boolean;
}) {
  return (
    <div className={`gf-summary__row${highlight ? " gf-summary__row--highlight" : ""}`}>
      <dt>{label}</dt>
      <dd
        className={[
          mono ? "gf-summary__mono" : "",
          pre ? "gf-summary__pre" : "",
          error ? "gf-summary__error" : "",
          success ? "gf-summary__success" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        {value}
      </dd>
    </div>
  );
}
