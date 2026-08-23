import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";

const MAX_RESULTS = 80;

export function GoToSymbolModal({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const { scan, openProblem } = useWorkspace();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const results = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!scan || q === "") return [];
    return scan.symbols
      .filter((s) => s.name.toLowerCase().includes(q))
      .slice(0, MAX_RESULTS);
  }, [scan, query]);

  if (!open) return null;

  const openSymbol = (path: string, line: number | null | undefined) => {
    const file = scan?.files.find((f) => f.path === path);
    if (!file) return;
    openProblem({
      file: path,
      absFile: file.absPath,
      line: line != null && line > 0 ? line : 1,
      column: 1,
      code: "symbol",
      message: path,
      severity: "warning",
      source: "monaco",
    });
    onClose();
  };

  return (
    <div className="quick-open" role="presentation" onClick={onClose}>
      <div
        className="quick-open__panel quick-open__panel--wide"
        role="dialog"
        aria-modal="true"
        aria-label="Go to symbol"
        onClick={(e) => e.stopPropagation()}
      >
        <label className="quick-open__label" htmlFor="go-to-symbol-input">
          Go to symbol
        </label>
        <input
          ref={inputRef}
          id="go-to-symbol-input"
          className="quick-open__input"
          type="search"
          spellCheck={false}
          placeholder="Symbol name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
            }
          }}
        />
        <ul className="quick-open__results">
          {results.length === 0 ? (
            <li className="quick-open__empty">No matching symbols.</li>
          ) : (
            results.map((symbol, index) => (
              <li key={`${symbol.path}:${symbol.name}:${index}`}>
                <button
                  type="button"
                  className="quick-open__result"
                  onClick={() => openSymbol(symbol.path, symbol.line)}
                >
                  <span className="quick-open__result-name">{symbol.name}</span>
                  <span className="quick-open__result-path">{symbol.path}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
