import { useEffect, useMemo, useState } from "react";
import type { SymbolEntry } from "@/types";
import { useWorkspace } from "@/app/workspaceContext";
import { IndexStatus } from "@/components/IndexStatus";
import { EmptyState } from "@/components/EmptyState";

type SearchMode = "files" | "symbols" | "content";

const MAX_RESULTS = 200;
const GREP_DEBOUNCE_MS = 300;

const KIND_LABEL: Record<SymbolEntry["kind"], string> = {
  component: "C",
  function: "ƒ",
  export: "E",
  hook: "H",
  class: "◇",
  interface: "I",
  type: "T",
};

type GrepHit = { readonly path: string; readonly line: number; readonly text: string };

/**
 * Sidebar "Search" view: file paths, symbols, and ripgrep content search.
 */
export function SearchView() {
  const { project, scan, openPath, openProblem } = useWorkspace();
  const [mode, setMode] = useState<SearchMode>("files");
  const [query, setQuery] = useState("");
  const [grepHits, setGrepHits] = useState<readonly GrepHit[]>([]);
  const [grepError, setGrepError] = useState<string | null>(null);
  const [grepLoading, setGrepLoading] = useState(false);

  useEffect(() => {
    const onFocus = () => setMode("content");
    window.addEventListener("bryantlabs:focus-content-search", onFocus);
    return () => window.removeEventListener("bryantlabs:focus-content-search", onFocus);
  }, []);

  const normalized = query.trim().toLowerCase();
  const grepQuery = query.trim();

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

  useEffect(() => {
    if (mode !== "content" || grepQuery.length < 2) {
      setGrepHits([]);
      setGrepError(null);
      setGrepLoading(false);
      return;
    }

    const api = window.bryantlabs;
    if (!api?.grepProject) {
      setGrepHits([]);
      setGrepError("Content search requires the BryantLabs desktop app.");
      return;
    }

    let cancelled = false;
    setGrepLoading(true);
    const timer = window.setTimeout(() => {
      void api.grepProject(grepQuery, 60).then((result) => {
        if (cancelled) return;
        if ("error" in result) {
          setGrepHits([]);
          setGrepError(result.error);
        } else {
          setGrepHits(result.hits);
          setGrepError(null);
        }
        setGrepLoading(false);
      });
    }, GREP_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [mode, grepQuery]);

  const openGrepHit = (hit: GrepHit) => {
    const file = scan?.files.find((f) => f.path === hit.path);
    if (!file) return;
    openProblem({
      file: hit.path,
      absFile: file.absPath,
      line: Math.max(1, hit.line),
      column: 1,
      code: "search",
      message: hit.text.trim() || hit.path,
      severity: "warning",
      source: "monaco",
    });
  };

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
          <button
            type="button"
            className={`segmented__btn${mode === "content" ? " segmented__btn--active" : ""}`}
            onClick={() => setMode("content")}
          >
            Content
          </button>
        </div>
        <input
          className="search__input"
          type="search"
          spellCheck={false}
          placeholder={
            mode === "files"
              ? "Search file paths…"
              : mode === "symbols"
                ? "Search symbol names…"
                : "Search file contents (regex)…"
          }
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <IndexStatus />
      </div>

      <div className="search__results">
        {mode === "content" ? (
          grepQuery.length < 2 ? (
            <p className="search__hint">Type at least 2 characters to search file contents.</p>
          ) : grepLoading ? (
            <p className="search__hint">Searching…</p>
          ) : grepError ? (
            <p className="search__hint" role="alert">
              {grepError}
            </p>
          ) : grepHits.length === 0 ? (
            <p className="search__hint">No matching lines.</p>
          ) : (
            <ul className="result-list">
              {grepHits.map((hit, index) => (
                <li key={`${hit.path}:${hit.line}:${index}`}>
                  <button
                    type="button"
                    className="result"
                    onClick={() => openGrepHit(hit)}
                    title={`${hit.path}:${hit.line}`}
                  >
                    <span className="result__name">{hit.path}</span>
                    <span className="result__path">:{hit.line}</span>
                    <span className="result__path">{hit.text.trim()}</span>
                  </button>
                </li>
              ))}
            </ul>
          )
        ) : normalized === "" ? (
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
