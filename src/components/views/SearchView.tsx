import { useMemo, useState } from "react";
import type { SymbolEntry } from "@/types";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { IndexStatus } from "@/components/IndexStatus";
import { EmptyState } from "@/components/EmptyState";

type SearchMode = "files" | "symbols";

const MAX_RESULTS = 200;

const KIND_LABEL: Record<SymbolEntry["kind"], string> = {
  component: "C",
  function: "ƒ",
  export: "E",
  hook: "H",
  class: "◇",
  interface: "I",
  type: "T",
};

/**
 * Sidebar "Search" view: global file-path search and global symbol search over
 * the in-memory project index. Clicking a result opens the file (read-only).
 */
export function SearchView() {
  const { project, scan, openPath } = useWorkspace();
  const [mode, setMode] = useState<SearchMode>("files");
  const [query, setQuery] = useState("");

  const normalized = query.trim().toLowerCase();

  const fileResults = useMemo(() => {
    if (!scan || mode !== "files" || normalized === "") return [];
    return scan.files
      .filter((f) => f.path.toLowerCase().includes(normalized))
      .slice(0, MAX_RESULTS);
  }, [scan, mode, normalized]);

  const symbolResults = useMemo(() => {
    if (!scan || mode !== "symbols" || normalized === "") return [];
    return scan.symbols
      .filter((s) => s.name.toLowerCase().includes(normalized))
      .slice(0, MAX_RESULTS);
  }, [scan, mode, normalized]);

  if (!project) {
    return (
      <div className="sidebar-section">
        <EmptyState
          title="No project open"
          description="Open a project to search its files and symbols."
        />
      </div>
    );
  }

  return (
    <div className="search">
      <div className="search__controls">
        <div className="segmented">
          <button
            type="button"
            className={`segmented__btn${mode === "files" ? " segmented__btn--active" : ""}`}
            onClick={() => setMode("files")}
          >
            Files
          </button>
          <button
            type="button"
            className={`segmented__btn${mode === "symbols" ? " segmented__btn--active" : ""}`}
            onClick={() => setMode("symbols")}
          >
            Symbols
          </button>
        </div>
        <input
          className="search__input"
          type="search"
          spellCheck={false}
          placeholder={
            mode === "files" ? "Search file paths…" : "Search symbol names…"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <IndexStatus />
      </div>

      <div className="search__results">
        {normalized === "" ? (
          <p className="search__hint">
            Type to search {mode === "files" ? "files by path" : "symbols by name"}.
          </p>
        ) : mode === "files" ? (
          fileResults.length === 0 ? (
            <p className="search__hint">No matching files.</p>
          ) : (
            <ul className="result-list">
              {fileResults.map((f) => (
                <li key={f.absPath}>
                  <button
                    type="button"
                    className="result"
                    onClick={() => void openPath(f.absPath)}
                    title={f.path}
                  >
                    <span className="result__name">{f.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : symbolResults.length === 0 ? (
          <p className="search__hint">No matching symbols.</p>
        ) : (
          <ul className="result-list">
            {symbolResults.map((s, i) => (
              <li key={`${s.absPath}:${s.kind}:${s.name}:${i}`}>
                <button
                  type="button"
                  className="result"
                  onClick={() => void openPath(s.absPath)}
                  title={`${s.name} — ${s.path}`}
                >
                  <span className={`result__kind result__kind--${s.kind}`}>
                    {KIND_LABEL[s.kind]}
                  </span>
                  <span className="result__name">{s.name}</span>
                  <span className="result__path">{s.path}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
