import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";

const MAX_RESULTS = 80;

function scorePath(path: string, query: string): number {
  const lowerPath = path.toLowerCase();
  const lowerQuery = query.toLowerCase();
  if (lowerPath === lowerQuery) return 100;
  if (lowerPath.endsWith(`/${lowerQuery}`)) return 90;
  const base = lowerPath.split("/").pop() ?? lowerPath;
  if (base === lowerQuery) return 85;
  if (base.startsWith(lowerQuery)) return 70;
  if (lowerPath.includes(lowerQuery)) return 50;
  return 0;
}

export function GoToFileModal({
  open,
  onClose,
}: {
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const { scan, openFile } = useWorkspace();
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setActiveIdx(0);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  const results = useMemo(() => {
    if (!scan) return [];
    const q = query.trim();
    const files = scan.files;
    if (!q) {
      return files.slice(0, MAX_RESULTS).map((f) => f.path);
    }
    return files
      .map((f) => ({ path: f.path, score: scorePath(f.path, q) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, MAX_RESULTS)
      .map((row) => row.path);
  }, [scan, query]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  if (!open) return null;

  const openPath = async (relPath: string) => {
    const file = scan?.files.find((f) => f.path === relPath);
    if (!file) return;
    await openFile({ name: relPath.split("/").pop() ?? relPath, path: file.absPath, type: "file" });
    onClose();
  };

  return (
    <div className="quick-open" role="presentation" onClick={onClose}>
      <div
        className="quick-open__panel quick-open__panel--wide"
        role="dialog"
        aria-modal="true"
        aria-label="Go to file"
        onClick={(e) => e.stopPropagation()}
      >
        <label className="quick-open__label" htmlFor="go-to-file-input">
          Go to file
        </label>
        <input
          ref={inputRef}
          id="go-to-file-input"
          className="quick-open__input"
          type="search"
          spellCheck={false}
          placeholder="File name…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              onClose();
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActiveIdx((idx) => Math.min(idx + 1, Math.max(0, results.length - 1)));
              return;
            }
            if (e.key === "ArrowUp") {
              e.preventDefault();
              setActiveIdx((idx) => Math.max(idx - 1, 0));
              return;
            }
            if (e.key === "Enter" && results[activeIdx]) {
              e.preventDefault();
              void openPath(results[activeIdx]!);
            }
          }}
        />
        <p className="quick-open__hint">⌘P · Enter to open · Esc to close</p>
        <ul className="quick-open__results">
          {results.length === 0 ? (
            <li className="quick-open__empty">No matching files.</li>
          ) : (
            results.map((path, idx) => (
              <li key={path}>
                <button
                  type="button"
                  className={`quick-open__result${idx === activeIdx ? " quick-open__result--active" : ""}`}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => void openPath(path)}
                >
                  <span className="quick-open__result-name">{path.split("/").pop()}</span>
                  <span className="quick-open__result-path">{path}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
