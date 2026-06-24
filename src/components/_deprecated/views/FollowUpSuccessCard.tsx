import { formatElapsedDuration, type FollowUpSuccessSnapshot } from "@/core/build/followUpRun";
import { SuggestedNextStepsPanel } from "@/components/views/SuggestedNextStepsPanel";

interface FollowUpSuccessCardProps {
  success: FollowUpSuccessSnapshot;
  onContinue: () => void;
  onUndo: () => void;
  onOpenPreview: () => void;
  onViewChanges: () => void;
  onSuggestionClick: (text: string) => void;
  undoAvailable: boolean;
}

export function FollowUpSuccessCard({
  success,
  onContinue,
  onUndo,
  onOpenPreview,
  onViewChanges,
  onSuggestionClick,
  undoAvailable,
}: FollowUpSuccessCardProps) {
  const providerLine = [success.provider, success.model].filter(Boolean).join(" · ");

  return (
    <section className="follow-up-success" aria-label="Follow-up completed">
      <h4 className="follow-up-success__title">Success</h4>
      <p className="follow-up-success__summary">{success.summary}</p>

      <div className="follow-up-success__grid">
        <p className="follow-up-success__meta">
          <span className="follow-up-success__label">Files Modified</span>{" "}
          {success.filesModified.length}
        </p>
        {providerLine ? (
          <p className="follow-up-success__meta">
            <span className="follow-up-success__label">Provider</span> {providerLine}
          </p>
        ) : null}
        <p className="follow-up-success__meta">
          <span className="follow-up-success__label">Duration</span>{" "}
          {formatElapsedDuration(success.durationMs)}
        </p>
        <p className="follow-up-success__meta">
          <span className="follow-up-success__label">TypeScript</span>{" "}
          {success.typecheckPassed ? "✓ Passed" : "—"}
        </p>
        <p className="follow-up-success__meta">
          <span className="follow-up-success__label">Build</span>{" "}
          {success.buildPassed ? "✓ Passed" : "—"}
        </p>
        <p className="follow-up-success__meta">
          <span className="follow-up-success__label">Preview</span>{" "}
          {success.previewReady ? "✓ Ready" : "—"}
        </p>
      </div>

      {success.filesModified.length > 0 ? (
        <ul className="follow-up-success__files">
          {success.filesModified.map((f) => (
            <li key={f}>{f}</li>
          ))}
        </ul>
      ) : null}

      {success.suggestedNextSteps.length > 0 ? (
        <SuggestedNextStepsPanel
          steps={success.suggestedNextSteps}
          onSelect={onSuggestionClick}
        />
      ) : null}

      <div className="follow-up-success__actions">
        <button type="button" className="prov-btn prov-btn--primary" onClick={onContinue}>
          Continue Building
        </button>
        {undoAvailable ? (
          <button type="button" className="prov-btn" onClick={onUndo}>
            Undo Last Change
          </button>
        ) : null}
        {success.previewReady ? (
          <button type="button" className="prov-btn" onClick={onOpenPreview}>
            Open Preview
          </button>
        ) : null}
        <button type="button" className="prov-btn" onClick={onViewChanges}>
          View Changes
        </button>
      </div>
    </section>
  );
}
