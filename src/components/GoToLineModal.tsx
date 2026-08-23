import { useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";

export function GoToLineModal({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const { activePath, openProblem } = useWorkspace();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setValue("");
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  if (!open) return null;

  const submit = () => {
    const line = Number.parseInt(value.trim(), 10);
    if (!Number.isFinite(line) || line < 1 || !activePath) {
      onClose();
      return;
    }
    openProblem({
      file: activePath.split(/[/\\]/).pop() ?? activePath,
      absFile: activePath,
      line,
      column: 1,
      code: "goto",
      message: `Go to line ${line}`,
      severity: "warning",
      source: "monaco",
    });
    onClose();
  };

  return (
    <div className="quick-open" role="presentation" onClick={onClose}>
      <div
        className="quick-open__panel"
        role="dialog"
        aria-modal="true"
        aria-label="Go to line"
        onClick={(e) => e.stopPropagation()}
      >
        <label className="quick-open__label" htmlFor="go-to-line-input">
          Go to line
        </label>
        <input
          ref={inputRef}
          id="go-to-line-input"
          className="quick-open__input"
          type="text"
          inputMode="numeric"
          placeholder="Line number"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              submit();
            }
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <p className="quick-open__hint">
          {activePath ? "Jump in the active editor file." : "Open a file first."}
        </p>
      </div>
    </div>
  );
}
