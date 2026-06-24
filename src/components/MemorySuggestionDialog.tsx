import type { MemoryCandidate } from "@/core/memory/types";
import { MEMORY_CATEGORY_LABELS } from "@/core/memory/types";

export function MemorySuggestionDialog({
  candidates,
  onAccept,
  onAcceptAll,
  onReject,
}: {
  candidates: readonly MemoryCandidate[];
  onAccept: (index: number) => void;
  onAcceptAll: () => void;
  onReject: () => void;
}) {
  if (candidates.length === 0) return null;

  return (
    <div className="memory-suggest" role="dialog" aria-modal="true">
      <div className="memory-suggest__card glass-panel">
        <h3 className="memory-suggest__title">Save to memory?</h3>
        <p className="plan__muted">
          Studio learned from this successful run. Save these memories for future AI runs?
        </p>
        <ul className="memory-suggest__list">
          {candidates.map((c, index) => (
            <li key={`${c.category}-${c.title}-${index}`} className="memory-suggest__item">
              <div className="memory-suggest__meta">
                <span className="memory-suggest__badge">
                  {MEMORY_CATEGORY_LABELS[c.category]}
                </span>
                <strong>{c.title}</strong>
              </div>
              <p className="memory-suggest__content">{c.content}</p>
              <p className="plan__muted">{c.reason}</p>
              <button
                type="button"
                className="prov-btn prov-btn--primary"
                onClick={() => onAccept(index)}
              >
                Save this memory
              </button>
            </li>
          ))}
        </ul>
        <div className="memory-suggest__actions">
          <button type="button" className="prov-btn prov-btn--primary" onClick={onAcceptAll}>
            Save all
          </button>
          <button type="button" className="prov-btn" onClick={onReject}>
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
