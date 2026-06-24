import { useEffect, useRef, useState } from "react";

export interface InlineEditPanelProps {
  readonly open: boolean;
  readonly line: number;
  readonly relPath: string;
  readonly running: boolean;
  readonly onClose: () => void;
  readonly onSubmit: (instruction: string) => void;
}

export function InlineEditPanel({
  open,
  line,
  relPath,
  running,
  onClose,
  onSubmit,
}: InlineEditPanelProps) {
  const [instruction, setInstruction] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) {
      setInstruction("");
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const submit = () => {
    const trimmed = instruction.trim();
    if (!trimmed || running) return;
    onSubmit(trimmed);
  };

  return (
    <div className="inline-edit" data-testid="inline-edit-panel">
      <div className="inline-edit__header">
        <span className="inline-edit__label">
          Edit selection · <code>{relPath}</code> · line {line}
        </span>
        <button type="button" className="inline-edit__close" onClick={onClose} aria-label="Close">
          ×
        </button>
      </div>
      <textarea
        ref={inputRef}
        className="inline-edit__input composer__input"
        rows={2}
        spellCheck={false}
        placeholder="Describe the change for the selected code…"
        value={instruction}
        disabled={running}
        onChange={(e) => setInstruction(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className="inline-edit__actions">
        <button
          type="button"
          className="prov-btn prov-btn--primary"
          disabled={running || !instruction.trim()}
          onClick={submit}
        >
          {running ? "Generating…" : "Generate"}
        </button>
        <span className="plan__muted inline-edit__hint">⌘K · Enter to run · Esc to close</span>
      </div>
    </div>
  );
}
