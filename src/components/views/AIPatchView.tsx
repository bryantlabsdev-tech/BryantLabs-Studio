import { useMemo, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { EmptyState } from "@/components/EmptyState";
import { AIPatchReviewActions } from "@/components/editor/AIPatchReviewActions";
import { computeDiff } from "@/core/editor";
import type { AIPatchSession } from "@/core/planner/aiTypes";

type PatchView = "diff" | "current" | "proposed";

/**
 * AI Patch panel (Phases 8–9). Propose a patch via the active provider, review
 * the diff, explicitly approve, then apply through the Phase 5 safe write
 * engine. No autonomous writes — human approval is required.
 */
export function AIPatchView() {
  const {
    project,
    activeFile,
    aiPatchSession,
    patchStatus,
    patchError,
    aiPatchApproved,
    aiPatchApplyStatus,
    aiPatchApplyError,
    canUndo,
    proposeAIPatch,
    approveAIPatch,
    discardAIPatchApproval,
    applyAIPatch,
    undoLastEdit,
    runVerification,
    verifyStatus,
  } = useWorkspace();
  const [prompt, setPrompt] = useState("");
  const [view, setView] = useState<PatchView>("diff");

  if (!project) {
    return (
      <div className="aipatch__empty">
        <EmptyState
          title="No project open"
          description="Open a project, then open a file to propose and apply an AI patch."
        />
      </div>
    );
  }

  if (!activeFile || !activeFile.result.readable) {
    return (
      <div className="aipatch__empty">
        <EmptyState
          title="No file open"
          description="Open a readable text file to propose an AI patch for it."
        />
      </div>
    );
  }

  const current = activeFile.result.content;
  const abs = activeFile.node.path;
  const rel = abs.startsWith(project.path)
    ? abs.slice(project.path.length).replace(/^[/\\]+/, "")
    : activeFile.node.name;

  const running = patchStatus === "running";
  const sessionForFile =
    aiPatchSession?.relPath === rel && aiPatchSession.patch.ok
      ? aiPatchSession
      : null;

  const submit = () => {
    if (prompt.trim() === "" || running) return;
    void proposeAIPatch(prompt);
  };

  return (
    <div className="aipatch">
      <div className="aipatch__target">
        <span className="aipatch__target-label">Target file</span>
        <code className="aipatch__target-path">{rel}</code>
      </div>

      <textarea
        className="composer__input"
        rows={3}
        spellCheck={false}
        placeholder="Describe the change to propose, e.g. “add JSDoc to each exported function”"
        value={prompt}
        disabled={running || aiPatchApplyStatus === "applying"}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
        }}
      />
      <div className="aipatch__actions">
        <button
          type="button"
          className="prov-btn prov-btn--primary"
          onClick={submit}
          disabled={running || prompt.trim() === "" || aiPatchApplyStatus === "applying"}
        >
          {running ? "Asking provider…" : "Propose AI patch"}
        </button>
      </div>

      {patchStatus === "error" && !sessionForFile ? (
        <div className="aipatch__error-box">
          <p className="aipatch__error">{patchError ?? "Patch proposal failed."}</p>
          {aiPatchSession?.patch.rawText ? (
            <details className="aiplan__raw">
              <summary>Raw model output</summary>
              <pre className="aiplan__raw-pre">{aiPatchSession.patch.rawText}</pre>
            </details>
          ) : null}
        </div>
      ) : null}

      {running ? (
        <p className="aipatch__hint">
          Sending project context and the current file to the provider. Nothing is
          written until you approve and apply.
        </p>
      ) : sessionForFile ? (
        <ProposalReview
          session={sessionForFile}
          currentOnDisk={current}
          view={view}
          setView={setView}
          approved={aiPatchApproved}
          applyStatus={aiPatchApplyStatus}
          applyError={aiPatchApplyError}
          patchError={patchError}
          canUndo={canUndo}
          verifyStatus={verifyStatus}
          onApprove={approveAIPatch}
          onDiscardApproval={discardAIPatchApproval}
          onApply={() => void applyAIPatch()}
          onUndo={() => void undoLastEdit()}
          onVerify={() => void runVerification()}
        />
      ) : aiPatchSession && aiPatchSession.relPath !== rel ? (
        <p className="aipatch__hint">
          The previous proposal was for <code>{aiPatchSession.relPath}</code>.
          Propose again for this file.
        </p>
      ) : (
        <p className="aipatch__hint">
          Propose a patch, review the diff, approve, then apply via the safe write
          engine. You can optionally run verification afterward — nothing runs
          automatically.
        </p>
      )}
    </div>
  );
}

function ProposalReview({
  session,
  currentOnDisk,
  view,
  setView,
  approved,
  applyStatus,
  applyError,
  patchError,
  canUndo,
  verifyStatus,
  onApprove,
  onDiscardApproval,
  onApply,
  onUndo,
  onVerify,
}: {
  session: AIPatchSession;
  currentOnDisk: string;
  view: PatchView;
  setView: (v: PatchView) => void;
  approved: boolean;
  applyStatus: string;
  applyError: string | null;
  patchError: string | null;
  canUndo: boolean;
  verifyStatus: string;
  onApprove: () => void;
  onDiscardApproval: () => void;
  onApply: () => void;
  onUndo: () => void;
  onVerify: () => void;
}) {
  const { patch, basisContent, relPath, proposedAt } = session;
  const proposal = patch.proposal!;
  const hasDiff = proposal.newContent !== basisContent;
  const rows = useMemo(
    () => computeDiff(basisContent, proposal.newContent),
    [basisContent, proposal.newContent],
  );

  return (
    <div className="aipatch__result">
      <dl className="aipatch__meta">
        <Meta label="Provider" value={patch.provider} />
        <Meta label="Model" value={patch.model} />
        <Meta label="Target file" value={relPath} mono />
        <Meta
          label="Proposed"
          value={new Date(proposedAt).toLocaleString()}
        />
      </dl>

      {proposal.summary ? (
        <p className="plan__summary">{proposal.summary}</p>
      ) : null}

      {proposal.reasoning ? (
        <section className="plan__block">
          <h3 className="plan__heading">Reasoning</h3>
          <p className="aiplan__reasoning">{proposal.reasoning}</p>
        </section>
      ) : null}

      <section className="plan__block">
        <h3 className="plan__heading">Risk assessment</h3>
        {proposal.risks.length === 0 ? (
          <p className="plan__muted">None reported.</p>
        ) : (
          <ul className="plan__changes">
            {proposal.risks.map((risk, i) => (
              <li key={i}>{risk}</li>
            ))}
          </ul>
        )}
      </section>

      <div className="aipatch__viewtabs" role="tablist">
        {(["diff", "current", "proposed"] as PatchView[]).map((v) => (
          <button
            key={v}
            type="button"
            role="tab"
            aria-selected={view === v}
            className={`aipatch__viewtab${view === v ? " aipatch__viewtab--active" : ""}`}
            onClick={() => setView(v)}
          >
            {v === "diff"
              ? "Review diff"
              : v === "current"
                ? "Current file"
                : "Proposed patch"}
          </button>
        ))}
      </div>

      {view === "diff" ? (
        !hasDiff ? (
          <p className="aipatch__hint">
            The proposal is identical to the file at proposal time — nothing to apply.
          </p>
        ) : (
          <div className="diff">
            <p className="diff__desc">
              Diff at proposal time (basis → proposed). Apply uses the Phase 5 safe
              writer with concurrency checks.
            </p>
            <div className="diff__rows">
              {rows.map((row, i) => (
                <div key={i} className={`diff-row diff-row--${row.type}`}>
                  <span className="diff-row__num">{row.leftNo ?? ""}</span>
                  <span className="diff-row__num">{row.rightNo ?? ""}</span>
                  <span className="diff-row__sign">
                    {row.type === "add" ? "+" : row.type === "remove" ? "−" : " "}
                  </span>
                  <span className="diff-row__text">{row.text || " "}</span>
                </div>
              ))}
            </div>
          </div>
        )
      ) : (
        <pre className="aipatch__code">
          {view === "current" ? currentOnDisk : proposal.newContent}
        </pre>
      )}

      <AIPatchReviewActions
        session={session}
        currentOnDisk={currentOnDisk}
        approved={approved}
        applyStatus={applyStatus}
        applyError={applyError}
        patchError={patchError}
        canUndo={canUndo}
        verifyStatus={verifyStatus}
        onApprove={onApprove}
        onDiscardApproval={onDiscardApproval}
        onApply={onApply}
        onUndo={onUndo}
        onVerify={onVerify}
      />
    </div>
  );
}

function Meta({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="aipatch__meta-item">
      <dt className="aipatch__meta-label">{label}</dt>
      <dd className={`aipatch__meta-value${mono ? " aipatch__meta-value--mono" : ""}`}>
        {value}
      </dd>
    </div>
  );
}
