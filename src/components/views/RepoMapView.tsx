import { useMemo, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { IndexStatus } from "@/components/IndexStatus";
import { EmptyState } from "@/components/EmptyState";
import {
  buildRepoMapFileDetail,
  indexedFilePaths,
} from "@/core/repository/repoMap";

/**
 * Repo map — navigable hub files, top symbols, and per-file drill-down.
 */
export function RepoMapView() {
  const {
    project,
    scan,
    repository,
    findSymbolReferences,
    openPath,
    rescan,
    scanStatus,
  } = useWorkspace();

  const [selectedPath, setSelectedPath] = useState<string | null>(null);
  const [selectedSymbol, setSelectedSymbol] = useState<string | null>(null);

  const codeGraph = repository?.codeGraph;
  const indexedPaths = useMemo(() => indexedFilePaths(scan), [scan]);

  const fileDetail = useMemo(() => {
    if (!repository || !selectedPath) return null;
    return buildRepoMapFileDetail(repository, selectedPath);
  }, [repository, selectedPath]);

  const symbolRefs = useMemo(() => {
    if (!selectedSymbol) return null;
    return findSymbolReferences(selectedSymbol);
  }, [findSymbolReferences, selectedSymbol]);

  if (!project) {
    return (
      <div className="sidebar-section">
        <EmptyState
          title="No project open"
          description="Open a project to explore the repository map."
        />
      </div>
    );
  }

  return (
    <div className="repomap">
      <div className="overview__status">
        <IndexStatus />
        <button
          type="button"
          className="overview__rescan"
          onClick={() => void rescan()}
          disabled={scanStatus === "scanning"}
        >
          {scanStatus === "scanning" ? "Scanning…" : "Re-scan"}
        </button>
      </div>

      {codeGraph ? (
        <section className="repomap__section">
          <h3 className="repomap__title">Overview</h3>
          <pre className="repomap__narrative">{codeGraph.narrative}</pre>
        </section>
      ) : null}

      {codeGraph && codeGraph.hubFiles.length > 0 ? (
        <section className="repomap__section">
          <h3 className="repomap__title">Hub files</h3>
          <ul className="repomap__list">
            {codeGraph.hubFiles.map((hub) => (
              <li key={hub.path}>
                <button
                  type="button"
                  className="repomap__link"
                  onClick={() => {
                    setSelectedPath(hub.path);
                    setSelectedSymbol(null);
                    void openPath(
                      repository?.absByPath.get(hub.path) ?? hub.path,
                    );
                  }}
                >
                  <code>{hub.path}</code>
                  <span className="repomap__meta">{hub.dependencyCount} links</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {codeGraph && codeGraph.topReferencedSymbols.length > 0 ? (
        <section className="repomap__section">
          <h3 className="repomap__title">Top symbols</h3>
          <ul className="repomap__list">
            {codeGraph.topReferencedSymbols.map((symbol) => (
              <li key={`${symbol.definedIn}::${symbol.name}`}>
                <button
                  type="button"
                  className="repomap__link"
                  onClick={() => {
                    setSelectedSymbol(symbol.name);
                    setSelectedPath(symbol.definedIn);
                  }}
                >
                  <strong>{symbol.name}</strong>
                  <span className="repomap__meta">
                    {symbol.kind} · {symbol.referenceCount} refs · {symbol.definedIn}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="repomap__section">
        <h3 className="repomap__title">Indexed files ({indexedPaths.length})</h3>
        <ul className="repomap__list repomap__list--scroll">
          {indexedPaths.map((path) => (
            <li key={path}>
              <button
                type="button"
                className={`repomap__link${selectedPath === path ? " repomap__link--on" : ""}`}
                onClick={() => {
                  setSelectedPath(path);
                  setSelectedSymbol(null);
                }}
              >
                <code>{path}</code>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {fileDetail ? (
        <section className="repomap__section repomap__detail">
          <h3 className="repomap__title">File detail — {fileDetail.path}</h3>
          <p className="repomap__meta">
            {fileDetail.symbols.length} symbols · {fileDetail.imports.length} imports ·{" "}
            {fileDetail.exports.length} exports
          </p>
          {fileDetail.imports.length > 0 ? (
            <>
              <h4 className="repomap__subtitle">Imports</h4>
              <ul className="repomap__chips">
                {fileDetail.imports.map((item) => (
                  <li key={item}>
                    <code>{item}</code>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {fileDetail.exports.length > 0 ? (
            <>
              <h4 className="repomap__subtitle">Exports</h4>
              <ul className="repomap__chips">
                {fileDetail.exports.map((item) => (
                  <li key={item}>
                    <code>{item}</code>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {fileDetail.symbols.length > 0 ? (
            <>
              <h4 className="repomap__subtitle">Symbols</h4>
              <ul className="repomap__list">
                {fileDetail.symbols.map((symbol) => (
                  <li key={`${symbol.name}-${symbol.line ?? 0}`}>
                    <button
                      type="button"
                      className="repomap__link"
                      onClick={() => setSelectedSymbol(symbol.name)}
                    >
                      {symbol.name}
                      <span className="repomap__meta">
                        {symbol.kind}
                        {symbol.line != null ? ` · L${symbol.line}` : ""}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          <button
            type="button"
            className="repomap__open"
            onClick={() => void openPath(fileDetail.absPath)}
          >
            Open in editor
          </button>
        </section>
      ) : null}

      {symbolRefs && symbolRefs.length > 0 ? (
        <section className="repomap__section">
          <h3 className="repomap__title">References — {selectedSymbol}</h3>
          {symbolRefs.map((ref) => (
            <div key={`${ref.definedIn}::${ref.name}`} className="repomap__detail">
              <p className="repomap__meta">
                <strong>{ref.name}</strong> ({ref.kind}) in <code>{ref.definedIn}</code>
              </p>
              <ul className="repomap__list">
                {ref.usedIn.map((path: string) => (
                  <li key={path}>
                    <button
                      type="button"
                      className="repomap__link"
                      onClick={() => {
                        setSelectedPath(path);
                        void openPath(repository?.absByPath.get(path) ?? path);
                      }}
                    >
                      <code>{path}</code>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
