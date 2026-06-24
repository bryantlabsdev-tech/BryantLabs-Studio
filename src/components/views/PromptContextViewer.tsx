import { useEffect, useMemo, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { FOLDER_SELECTION_GATE_COPY } from "@/core/agent/folderSelectionGate";
import { latestPromptsByStage } from "@/core/intelligence/promptVisibility";
import type { FeasibilityResult } from "@/core/intelligence";

interface FolderSelectionGateProps {
  pendingPrompt: string;
  busy?: boolean;
  pickerError?: string | null;
  onStartNewProject: () => void;
  onOpenExistingFolder: () => void;
  onCancel: () => void;
}

export function FolderSelectionGate({
  pendingPrompt,
  busy = false,
  pickerError = null,
  onStartNewProject,
  onOpenExistingFolder,
  onCancel,
}: FolderSelectionGateProps) {
  return (
    <section className="feasibility-gate" aria-label="Choose project folder">
      <h4 className="build-view__heading">{FOLDER_SELECTION_GATE_COPY.title}</h4>
      <p className="plan__muted">{FOLDER_SELECTION_GATE_COPY.detail}</p>
      <p className="plan__muted feasibility-gate__pending-prompt">
        Your prompt: &ldquo;{pendingPrompt}&rdquo;
      </p>
      {pickerError ? (
        <p className="aipatch__error" role="alert">
          {pickerError}
        </p>
      ) : null}
      <div className="build-view__actions">
        <button
          type="button"
          className="prov-btn prov-btn--primary"
          disabled={busy}
          onClick={onStartNewProject}
        >
          {FOLDER_SELECTION_GATE_COPY.startNewLabel}
        </button>
        <button
          type="button"
          className="prov-btn"
          disabled={busy}
          onClick={onOpenExistingFolder}
        >
          {FOLDER_SELECTION_GATE_COPY.openExistingLabel}
        </button>
        <button type="button" className="prov-btn" disabled={busy} onClick={onCancel}>
          {FOLDER_SELECTION_GATE_COPY.cancelLabel}
        </button>
      </div>
    </section>
  );
}

interface FeasibilityGateProps {
  result: FeasibilityResult;
  onProceed: () => void;
  onCancel: () => void;
}

interface ClarifyingQuestionGateProps {
  question: string;
  onProceed: () => void;
  onCancel: () => void;
}

export function ClarifyingQuestionGate({
  question,
  onProceed,
  onCancel,
}: ClarifyingQuestionGateProps) {
  return (
    <section className="feasibility-gate" aria-label="Clarifying question">
      <h4 className="build-view__heading">Quick question</h4>
      <p className="plan__muted">{question}</p>
      <div className="build-view__actions">
        <button type="button" className="prov-btn prov-btn--primary" onClick={onProceed}>
          Continue anyway
        </button>
        <button type="button" className="prov-btn" onClick={onCancel}>
          Revise prompt
        </button>
      </div>
    </section>
  );
}

interface StaleRunGateProps {
  onResetAndStart: () => void;
  onCancel: () => void;
}

export function StaleRunGate({ onResetAndStart, onCancel }: StaleRunGateProps) {
  return (
    <section className="feasibility-gate" aria-label="Stale run state">
      <h4 className="build-view__heading">Previous run state detected</h4>
      <p className="plan__muted">
        Reset before starting a new run?
      </p>
      <div className="build-view__actions">
        <button type="button" className="prov-btn prov-btn--primary" onClick={onResetAndStart}>
          Reset and start
        </button>
        <button type="button" className="prov-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

export function FeasibilityGate({ result, onProceed, onCancel }: FeasibilityGateProps) {
  return (
    <section className="feasibility-gate" aria-label="Feasibility check">
      <h4 className="build-view__heading">{result.headline}</h4>
      <p className="plan__muted">{result.detail}</p>
      {result.requirements.length > 0 ? (
        <ul className="feasibility-gate__list">
          {result.requirements.map((req) => (
            <li key={req.id}>
              {req.satisfied ? "✓" : "○"} {req.label}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="build-view__actions">
        <button type="button" className="prov-btn prov-btn--primary" onClick={onProceed}>
          Proceed anyway
        </button>
        <button type="button" className="prov-btn" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </section>
  );
}

interface PromptContextViewerProps {
  open: boolean;
  onClose: () => void;
}

export function PromptContextViewer({ open, onClose }: PromptContextViewerProps) {
  const { complexityRouting } = useWorkspace();
  const [tick, setTick] = useState(0);

  useEffect(() => {
    if (!open) return;
    setTick((t) => t + 1);
  }, [open]);

  const prompts = useMemo(() => latestPromptsByStage(), [open, tick]);

  if (!open) return null;

  return (
    <section className="prompt-context-viewer" aria-label="Prompt context visibility">
      <div className="build-view__timeline-head">
        <h4 className="build-view__heading">View Context</h4>
        <button type="button" className="build-view__link" onClick={onClose}>
          Close
        </button>
      </div>
      {complexityRouting ? (
        <p className="plan__muted">
          Selected model: {complexityRouting.provider} · {complexityRouting.model} —{" "}
          {complexityRouting.reason} (score {complexityRouting.score})
        </p>
      ) : null}
      {(["planner", "coder", "repair"] as const).map((stage) => {
        const entry = prompts[stage];
        return (
          <details key={stage} className="prompt-context-viewer__stage" open>
            <summary>{stage}</summary>
            {entry ? (
              <>
                <p className="plan__muted">
                  {entry.provider ?? "—"} · {entry.model ?? "—"} ·{" "}
                  {new Date(entry.at).toLocaleString()}
                </p>
                <pre className="prompt-context-viewer__pre">{entry.prompt}</pre>
              </>
            ) : (
              <p className="plan__muted">No prompt recorded yet for this stage.</p>
            )}
          </details>
        );
      })}
    </section>
  );
}
