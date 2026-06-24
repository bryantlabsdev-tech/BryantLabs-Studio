import { useMemo, useState } from "react";
import type { AIPatchSession } from "@/core/planner/aiTypes";
import type { PlanApplyFileEntry } from "@/core/planApply/types";
import { DiffRowsView } from "@/components/editor/DiffRowsView";
import {
  deriveAiPatchReviewState,
  derivePlanApplyReviewState,
  groupPlanApplyFiles,
  type PlanApplyFileReview,
} from "@/core/patch/patchReviewModel";

export interface PatchReviewAiPatchProps {
  readonly kind: "ai_patch";
  readonly session: AIPatchSession;
  readonly currentOnDisk: string;
  readonly approved: boolean;
  readonly applyStatus: string;
  readonly applyError: string | null;
  readonly patchError: string | null;
  readonly canUndo: boolean;
  readonly verifyStatus: string;
  readonly compact?: boolean;
  readonly onApprove: () => void;
  readonly onDiscardApproval: () => void;
  readonly onApply: () => void;
  readonly onUndo: () => void;
  readonly onVerify: () => void;
}

export interface PatchReviewPlanApplyProps {
  readonly kind: "plan_apply";
  readonly layout: "chat" | "center";
  readonly phase: string;
  readonly planSummary: string | null;
  readonly changedFiles: readonly PlanApplyFileEntry[];
  readonly selectedRelPath: string | null;
  readonly error: string | null;
  readonly onAcceptAll: () => void;
  readonly onRejectAll: () => void;
  readonly onRegenerate: () => void;
  readonly onApplyApproved?: () => void;
  readonly onSelectFile?: (relPath: string) => void;
  readonly onAcceptFile?: (relPath: string) => void;
  readonly onRejectFile?: (relPath: string) => void;
}

export type PatchReviewPanelProps = PatchReviewAiPatchProps | PatchReviewPlanApplyProps;

function PatchReviewMessages({
  stale,
  hasDiff,
  approved,
  compact,
  patchError,
  applyError,
  applyStatus,
}: {
  readonly stale: boolean;
  readonly hasDiff: boolean;
  readonly approved: boolean;
  readonly compact: boolean;
  readonly patchError: string | null;
  readonly applyError: string | null;
  readonly applyStatus: string;
}) {
  return (
    <>
      {stale ? (
        <p className="patch-review__stale aipatch__stale">
          The file changed on disk since this proposal. Apply is blocked — propose a
          new patch from the current content.
        </p>
      ) : null}
      {!hasDiff ? (
        <p className="patch-review__hint aipatch__hint">
          The proposal is identical to the file at proposal time — nothing to apply.
        </p>
      ) : null}
      {(patchError || applyError) ? (
        <p className="patch-review__error aipatch__error">{applyError ?? patchError}</p>
      ) : null}
      {applyStatus === "applied" ? (
        <p className="patch-review__success aipatch__success">
          Patch applied successfully. The file was re-read and verified on disk.
        </p>
      ) : null}
      {!compact && !approved && hasDiff ? (
        <p className="patch-review__hint aipatch__hint">
          Review the diff, then click <strong>Approve patch</strong> before applying.
        </p>
      ) : null}
    </>
  );
}

function PatchReviewBulkBar({
  canAcceptAll,
  canApplyApproved,
  busy,
  onAcceptAll,
  onRejectAll,
  onRegenerate,
  onApplyApproved,
  acceptLabel = "Accept all",
  rejectLabel = "Reject all",
}: {
  readonly canAcceptAll: boolean;
  readonly canApplyApproved: boolean;
  readonly busy: boolean;
  readonly onAcceptAll: () => void;
  readonly onRejectAll: () => void;
  readonly onRegenerate: () => void;
  readonly onApplyApproved?: () => void;
  readonly acceptLabel?: string;
  readonly rejectLabel?: string;
}) {
  return (
    <div className="patch-review__bulk-actions agent-patch-review__bulk-actions">
      <button
        type="button"
        className="prov-btn prov-btn--primary"
        disabled={!canAcceptAll || busy}
        onClick={onAcceptAll}
      >
        {acceptLabel}
      </button>
      <button
        type="button"
        className="prov-btn"
        disabled={busy}
        onClick={onRejectAll}
      >
        {rejectLabel}
      </button>
      {onApplyApproved ? (
        <button
          type="button"
          className="prov-btn prov-btn--primary"
          disabled={!canApplyApproved || busy}
          onClick={onApplyApproved}
        >
          Apply approved
        </button>
      ) : null}
      <button type="button" className="build-view__link" disabled={busy} onClick={onRegenerate}>
        Regenerate
      </button>
    </div>
  );
}

function PlanApplyFileList({
  files,
  layout,
  expandedPath,
  selectedRelPath,
  onToggle,
  onSelect,
  onAcceptFile,
  onRejectFile,
  busy,
}: {
  readonly files: readonly PlanApplyFileReview[];
  readonly layout: "chat" | "center";
  readonly expandedPath: string | null;
  readonly selectedRelPath: string | null;
  readonly onToggle: (relPath: string) => void;
  readonly onSelect?: (relPath: string) => void;
  readonly onAcceptFile?: (relPath: string) => void;
  readonly onRejectFile?: (relPath: string) => void;
  readonly busy: boolean;
}) {
  const groups = useMemo(() => groupPlanApplyFiles(files), [files]);

  if (layout === "center") {
    return (
      <div className="patch-review__file-chips" data-testid="patch-review-file-chips">
        {files.map((file) => (
          <button
            key={file.relPath}
            type="button"
            className={`patch-review__chip${selectedRelPath === file.relPath ? " patch-review__chip--on" : ""}`}
            onClick={() => onSelect?.(file.relPath)}
          >
            <code>{file.relPath}</code>
            <span className={`patch-review__risk patch-review__risk--${file.risk}`}>
              {file.risk}
            </span>
          </button>
        ))}
      </div>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <div key={group.label} className="agent-patch-review__group">
          <div className="agent-patch-review__group-head">{group.label}</div>
          {group.files.map((file) => {
            const expanded = expandedPath === file.relPath;
            return (
              <div key={file.relPath} className="agent-patch-review__file">
                <div className="agent-patch-review__file-head">
                  <span className="agent-patch-review__file-path">{file.relPath}</span>
                  <span className={`agent-patch-review__risk agent-patch-review__risk--${file.risk}`}>
                    {file.risk} risk
                  </span>
                  <button
                    type="button"
                    className="build-view__link"
                    onClick={() => onToggle(file.relPath)}
                  >
                    {expanded ? "Hide diff" : "Review file"}
                  </button>
                </div>
                <p className="agent-patch-review__file-reason">{file.reason}</p>
                {expanded && file.basisContent !== undefined && file.newContent !== undefined ? (
                  <div className="run-conversation__diff-panel" data-testid="run-inline-diff">
                    <DiffRowsView before={file.basisContent} after={file.newContent} />
                  </div>
                ) : null}
                {onAcceptFile && onRejectFile ? (
                  <div className="patch-review__file-actions">
                    <button
                      type="button"
                      className="prov-btn prov-btn--small"
                      disabled={busy || file.decision === "approved"}
                      onClick={() => onAcceptFile(file.relPath)}
                    >
                      Accept file
                    </button>
                    <button
                      type="button"
                      className="prov-btn prov-btn--small"
                      disabled={busy || file.decision === "rejected"}
                      onClick={() => onRejectFile(file.relPath)}
                    >
                      Reject file
                    </button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ))}
    </>
  );
}

function AiPatchReviewPanel(props: PatchReviewAiPatchProps) {
  const state = deriveAiPatchReviewState({
    session: props.session,
    currentOnDisk: props.currentOnDisk,
    approved: props.approved,
    applyStatus: props.applyStatus,
  });
  const compact = props.compact ?? false;

  return (
    <section className="patch-review patch-review--ai" data-testid="patch-review-panel">
      <PatchReviewMessages
        stale={state.stale}
        hasDiff={state.hasDiff}
        approved={props.approved}
        compact={compact}
        patchError={props.patchError}
        applyError={props.applyError}
        applyStatus={props.applyStatus}
      />
      <div className="patch-review__applybar aipatch__applybar">
        {!props.approved ? (
          <button
            type="button"
            className="prov-btn prov-btn--primary"
            disabled={!state.canApprove}
            onClick={props.onApprove}
          >
            Approve patch
          </button>
        ) : (
          <>
            <span className="patch-review__approved aipatch__approved">Approved</span>
            <button
              type="button"
              className="prov-btn"
              onClick={props.onDiscardApproval}
              disabled={props.applyStatus === "applying"}
            >
              Revoke approval
            </button>
          </>
        )}
        <button
          type="button"
          className="prov-btn prov-btn--primary"
          disabled={!state.canApply}
          onClick={props.onApply}
          title={
            !props.approved
              ? "Approve the patch after reviewing the diff"
              : state.stale
                ? "File changed — propose a new patch"
                : undefined
          }
        >
          {props.applyStatus === "applying" ? "Applying…" : "Apply patch"}
        </button>
        <button
          type="button"
          className="prov-btn"
          disabled={!props.canUndo}
          onClick={props.onUndo}
        >
          Undo patch
        </button>
        {!compact ? (
          <button
            type="button"
            className="prov-btn"
            disabled={props.verifyStatus === "running"}
            onClick={props.onVerify}
            title="Optional — runs build + typecheck in the project"
          >
            {props.verifyStatus === "running" ? "Verifying…" : "Run verification"}
          </button>
        ) : null}
      </div>
    </section>
  );
}

function PlanApplyReviewPanel(props: PatchReviewPlanApplyProps) {
  const [expandedPath, setExpandedPath] = useState<string | null>(
    props.changedFiles[0]?.relPath ?? null,
  );

  const sessionLike = {
    phase: props.phase,
    prompt: "",
    files: props.changedFiles,
    planSummary: props.planSummary,
  } as import("@/core/planApply/types").PlanApplySession;

  const review = derivePlanApplyReviewState(sessionLike);
  const files = review?.changedFiles ?? [];
  const selected =
    files.find((file) => file.relPath === props.selectedRelPath) ?? files[0] ?? null;

  return (
    <section
      className={`patch-review patch-review--plan patch-review--${props.layout}`}
      data-testid="patch-review-panel"
    >
      <header className="agent-patch-review__head">
        <h4 className="agent-patch-review__title">Review changes</h4>
        <p className="agent-patch-review__summary plan__muted">
          {props.planSummary?.trim() || "Review proposed edits before applying them to your project."}
        </p>
        <PatchReviewBulkBar
          canAcceptAll={review?.canAcceptAll ?? files.length === 0}
          canApplyApproved={review?.canApplyApproved ?? false}
          busy={review?.busy ?? false}
          onAcceptAll={props.onAcceptAll}
          onRejectAll={props.onRejectAll}
          onRegenerate={props.onRegenerate}
          {...(props.onApplyApproved ? { onApplyApproved: props.onApplyApproved } : {})}
        />
      </header>

      {props.error ? <p className="patch-review__error aipatch__error">{props.error}</p> : null}

      <PlanApplyFileList
        files={files}
        layout={props.layout}
        expandedPath={expandedPath}
        selectedRelPath={props.selectedRelPath}
        onToggle={(relPath) =>
          setExpandedPath((current) => (current === relPath ? null : relPath))
        }
        {...(props.onSelectFile ? { onSelect: props.onSelectFile } : {})}
        {...(props.onAcceptFile ? { onAcceptFile: props.onAcceptFile } : {})}
        {...(props.onRejectFile ? { onRejectFile: props.onRejectFile } : {})}
        busy={review?.busy ?? false}
      />

      {props.layout === "center" && selected?.basisContent !== undefined && selected.newContent !== undefined ? (
        <div className="patch-review__center-diff">
          <DiffRowsView
            before={selected.basisContent}
            after={selected.newContent}
            description={selected.summary ?? selected.relPath}
          />
        </div>
      ) : null}
    </section>
  );
}

/** Unified patch review — AI single-file patches and multi-file plan apply. */
export function PatchReviewPanel(props: PatchReviewPanelProps) {
  if (props.kind === "ai_patch") return <AiPatchReviewPanel {...props} />;
  return <PlanApplyReviewPanel {...props} />;
}
