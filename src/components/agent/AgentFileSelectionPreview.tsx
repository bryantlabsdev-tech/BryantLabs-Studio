import { useMemo, useState } from "react";
import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import type { PlanApplySession } from "@/core/planApply/types";
import {
  deriveAgentFileSelectionPreview,
  fileSelectionPreviewText,
  type FileSelectionPreviewItem,
} from "@/core/agent/deriveAgentFileSelectionPreview";

const ACTION_LABELS: Record<FileSelectionPreviewItem["action"], string> = {
  read: "Read",
  edit: "Edit",
  create: "Create",
  validate: "Validate",
};

export interface AgentFileSelectionPreviewProps {
  readonly card: AgentRunCardViewModel;
  readonly planApplySession: PlanApplySession | null;
  readonly onOpenFile?: (path: string) => void;
  readonly onContinue?: () => void;
  readonly readOnly?: boolean;
}

export function AgentFileSelectionPreview({
  card,
  planApplySession,
  onOpenFile,
  onContinue,
  readOnly = true,
}: AgentFileSelectionPreviewProps) {
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const items = useMemo(
    () => deriveAgentFileSelectionPreview({ card, planApplySession }),
    [card, planApplySession],
  );

  if (items.length === 0) return null;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(fileSelectionPreviewText(items));
      setCopyNote("Copied");
    } catch {
      setCopyNote("Copy failed");
    }
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  return (
    <section className="agent-file-selection" data-testid="agent-file-selection-preview">
      <header className="agent-file-selection__head">
        <h4 className="agent-file-selection__title">Selected files</h4>
        <span className="agent-file-selection__count">{items.length} files</span>
      </header>

      <ul className="agent-file-selection__list">
        {items.map((item) => (
          <li key={item.path} className="agent-file-selection__item">
            <div className="agent-file-selection__item-head">
              {onOpenFile ? (
                <button
                  type="button"
                  className="agent-file-selection__path"
                  onClick={() => onOpenFile(item.path)}
                >
                  {item.path}
                </button>
              ) : (
                <span className="agent-file-selection__path">{item.path}</span>
              )}
              <span className="agent-file-selection__action">{ACTION_LABELS[item.action]}</span>
              {item.risk ? (
                <span className={`agent-file-selection__risk agent-file-selection__risk--${item.risk}`}>
                  {item.risk} risk
                </span>
              ) : null}
              {item.confidence != null ? (
                <span className="agent-file-selection__confidence">{item.confidence}%</span>
              ) : null}
            </div>
            <p className="agent-file-selection__reason">{item.reason}</p>
          </li>
        ))}
      </ul>

      <div className="agent-file-selection__actions">
        {onContinue ? (
          <button type="button" className="prov-btn prov-btn--primary" onClick={onContinue}>
            Continue
          </button>
        ) : null}
        {readOnly ? (
          <span className="agent-file-selection__todo plan__muted" title="Future enhancement">
            Edit selection — coming soon
          </span>
        ) : null}
        <button type="button" className="prov-btn" onClick={() => void handleCopy()}>
          Copy file list
        </button>
        {copyNote ? <span className="plan__muted">{copyNote}</span> : null}
      </div>
    </section>
  );
}
