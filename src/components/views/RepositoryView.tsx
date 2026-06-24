import { useMemo, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { IndexStatus } from "@/components/IndexStatus";
import { EmptyState } from "@/components/EmptyState";
import type { RepositorySearchHit } from "@/core/repository/types";
import type { PackageDependencyKind, ProjectDetections, SymbolKind } from "@/types";

const KIND_LABEL: Record<SymbolKind, string> = {
  component: "React component",
  function: "Function",
  export: "Export",
  hook: "React hook",
  class: "Class",
  interface: "Interface",
  type: "Type alias",
};

const DEP_KIND_LABEL: Record<PackageDependencyKind, string> = {
  dependencies: "Dependencies",
  devDependencies: "Dev",
  peerDependencies: "Peer",
};

const DETECTION_LABELS: ReadonlyArray<[keyof ProjectDetections, string]> = [
  ["packageJson", "package.json"],
  ["tsconfig", "tsconfig.json"],
  ["viteConfig", "vite.config"],
  ["react", "React"],
  ["nextjs", "Next.js"],
  ["electron", "Electron"],
  ["node", "Node"],
];

/**
 * Repository tab — project intelligence, dependencies, and symbol search.
 */
export function RepositoryView() {
  const {
    project,
    scan,
    scanStatus,
    repository,
    repositorySearch,
    smartFileSelection,
    openPath,
    rescan,
  } = useWorkspace();

  const [query, setQuery] = useState("");
  const [selectedHit, setSelectedHit] = useState<RepositorySearchHit | null>(
    null,
  );
  const [depFilter, setDepFilter] = useState<PackageDependencyKind | "all">(
    "all",
  );

  const searchHits = useMemo(
    () => (query.trim() ? repositorySearch(query) : []),
    [query, repositorySearch],
  );

  const codeGraph = repository?.codeGraph;

  const filteredDeps = useMemo(() => {
    const deps = scan?.dependencies ?? [];
    if (depFilter === "all") return deps;
    return deps.filter((d) => d.kind === depFilter);
  }, [scan?.dependencies, depFilter]);

  if (!project) {
    return (
      <div className="sidebar-section">
        <EmptyState
          title="No project open"
          description="Open a project to build the repository index."
        />
      </div>
    );
  }

  const summary = scan?.summary;
  const stats = repository?.stats ?? scan?.repositoryStats;

  return (
    <div className="repository">
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
      {scan?.scannedAt ? (
        <p className="repository__scan-time">
          Last scan: {new Date(scan.scannedAt).toLocaleString()}
        </p>
      ) : null}

      {summary ? (
        <>
          <dl className="facts repository__facts">
            <Fact label="Project" value={summary.name} />
            <Fact label="Framework" value={summary.framework} />
            <Fact label="Language" value={summary.language} />
            <Fact label="Bundler" value={summary.bundler ?? "unknown"} />
            <Fact label="Package manager" value={summary.packageManager} />
            <Fact label="Total files" value={String(summary.totalFiles)} />
            <Fact
              label="Indexed source files"
              value={String(stats?.totalFiles ?? "—")}
            />
            <Fact
              label="Components"
              value={String(stats?.totalComponents ?? "—")}
            />
          </dl>

          <section className="repository__section">
            <h3 className="repository__heading">Entry points</h3>
            {summary.entryPoints.length > 0 ? (
              <ul className="chips chips--paths">
                {summary.entryPoints.map((entry) => (
                  <li key={entry} className="chip chip--path">
                    {entry}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="plan__muted">None detected.</p>
            )}
          </section>

          <section className="repository__section">
            <h3 className="repository__heading">Detections</h3>
            <ul className="chips">
              {DETECTION_LABELS.map(([key, label]) => {
                const on = summary.detections[key];
                return (
                  <li
                    key={key}
                    className={`chip${on ? " chip--on" : " chip--off"}`}
                  >
                    {label}
                  </li>
                );
              })}
            </ul>
          </section>

          {scan.repositorySummary ? (
            <section className="repository__section">
              <h3 className="repository__heading">Repository summary</h3>
              <pre className="repository__summary">{scan.repositorySummary}</pre>
            </section>
          ) : null}

          {(scan.dependencies?.length ?? 0) > 0 ? (
            <section className="repository__section">
              <h3 className="repository__heading">Dependencies</h3>
              <div className="repository__dep-filters">
                {(["all", "dependencies", "devDependencies", "peerDependencies"] as const).map(
                  (k) => (
                    <button
                      key={k}
                      type="button"
                      className={`prov-btn${depFilter === k ? " prov-btn--active" : ""}`}
                      onClick={() => setDepFilter(k)}
                    >
                      {k === "all" ? "All" : DEP_KIND_LABEL[k]}
                    </button>
                  ),
                )}
              </div>
              <ul className="repository__dep-list">
                {filteredDeps.map((d) => (
                  <li key={`${d.kind}-${d.name}`}>
                    <code>{d.name}</code>
                    <span className="plan__muted"> {d.version}</span>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </>
      ) : scanStatus === "scanning" ? (
        <p className="plan__muted">Scanning project…</p>
      ) : (
        <p className="plan__muted">Not scanned yet.</p>
      )}

      {stats ? (
        <section className="repository__section">
          <h3 className="repository__heading">Symbol intelligence</h3>
          <dl className="repository__stats repository__stats--symbols">
            <div>
              <dt>Components</dt>
              <dd>{stats.totalComponents}</dd>
            </div>
            <div>
              <dt>Functions</dt>
              <dd>{stats.totalFunctions}</dd>
            </div>
            <div>
              <dt>Hooks</dt>
              <dd>{stats.totalHooks}</dd>
            </div>
            <div>
              <dt>Classes</dt>
              <dd>{stats.totalClasses}</dd>
            </div>
            <div>
              <dt>Interfaces</dt>
              <dd>{stats.totalInterfaces}</dd>
            </div>
            <div>
              <dt>Types</dt>
              <dd>{stats.totalTypes}</dd>
            </div>
            <div>
              <dt>Imports</dt>
              <dd>{stats.totalImports}</dd>
            </div>
            <div>
              <dt>Exports</dt>
              <dd>{stats.totalExports}</dd>
            </div>
          </dl>
          {codeGraph ? (
            <>
              <p className="repository__label">Dependency graph</p>
              <pre className="repository__summary">{codeGraph.narrative}</pre>
              {codeGraph.sampleDependencies.length > 0 ? (
                <ul className="repository__edge-list">
                  {codeGraph.sampleDependencies.slice(0, 12).map((e) => (
                    <li key={`${e.from}-${e.to}`}>
                      <code>{e.from}</code>
                      <span className="plan__muted"> → </span>
                      <code>{e.to}</code>
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      {smartFileSelection && smartFileSelection.files.length > 0 ? (
        <section className="repository__section">
          <h3 className="repository__heading">Smart file selection</h3>
          <p className="plan__muted">{smartFileSelection.reasoning}</p>
          <ul className="repository__rank-list">
            {smartFileSelection.files.slice(0, 12).map((f) => (
              <li key={f.path} className="repository__rank-row">
                <button
                  type="button"
                  className="search__link"
                  onClick={() => void openPath(f.absPath)}
                >
                  <code>{f.path}</code>
                </button>
                <span className="repository__rank-score">{f.score}</span>
                <span className="plan__muted">{f.primaryReason}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : (
        <section className="repository__section">
          <h3 className="repository__heading">Smart file selection</h3>
          <p className="plan__muted">
            Analyze &amp; plan with a prompt to rank likely edit targets (e.g.
            dashboard KPI cards).
          </p>
        </section>
      )}

      <section className="repository__section">
        <h3 className="repository__heading">Symbol search</h3>
        <input
          className="search__input"
          type="search"
          spellCheck={false}
          placeholder="Dashboard, App, createClient…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelectedHit(null);
          }}
        />
        {query.trim() === "" ? (
          <p className="plan__muted">Example: App, Dashboard, updateNote</p>
        ) : searchHits.length === 0 ? (
          <p className="plan__muted">No matches.</p>
        ) : (
          <ul className="search__results">
            {searchHits.map((hit) => {
              const key = `${hit.path}-${hit.symbolName ?? "file"}-${hit.score}`;
              const active =
                selectedHit?.path === hit.path &&
                selectedHit.symbolName === hit.symbolName;
              return (
                <li key={key}>
                  <button
                    type="button"
                    className={`search__result${active ? " search__result--active" : ""}`}
                    onClick={() => setSelectedHit(hit)}
                  >
                    {hit.symbolName ? (
                      <>
                        <strong>{hit.symbolName}</strong>
                        <span className="search__meta">
                          {KIND_LABEL[hit.symbolKind!]} · <code>{hit.path}</code>
                          {hit.line != null ? ` · line ${hit.line}` : ""}
                        </span>
                      </>
                    ) : (
                      <>
                        <code>{hit.path}</code>
                        <span className="search__meta">{hit.reason}</span>
                      </>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}

        {selectedHit ? (
          <div className="repository__symbol-detail">
            <h4 className="repository__heading">Symbol details</h4>
            {selectedHit.symbolName ? (
              <p className="repository__symbol">
                <strong>{selectedHit.symbolName}</strong>{" "}
                <span className="plan__muted">
                  ({selectedHit.symbolKind ? KIND_LABEL[selectedHit.symbolKind] : "symbol"})
                </span>
              </p>
            ) : null}
            <p>
              <span className="repository__label">File:</span>{" "}
              <button
                type="button"
                className="search__link"
                onClick={() => void openPath(selectedHit.absPath)}
              >
                <code>{selectedHit.path}</code>
              </button>
              {selectedHit.line != null ? (
                <span className="plan__muted"> · line {selectedHit.line}</span>
              ) : null}
            </p>
            {selectedHit.referencedBy && selectedHit.referencedBy.length > 0 ? (
              <>
                <p className="repository__label">Referenced by:</p>
                <ul className="search__results">
                  {selectedHit.referencedBy.map((p) => (
                    <li key={p}>
                      <button
                        type="button"
                        className="search__result"
                        onClick={() => {
                          const abs =
                            repository?.absByPath.get(p) ??
                            scan?.files.find((f) => f.path === p)?.absPath;
                          if (abs) void openPath(abs);
                        }}
                      >
                        <code>{p}</code>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : selectedHit.symbolName ? (
              <p className="plan__muted">No cross-file references in the index.</p>
            ) : null}
            <button
              type="button"
              className="prov-btn"
              onClick={() => void openPath(selectedHit.absPath)}
            >
              Open file
            </button>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="fact">
      <dt className="fact__label">{label}</dt>
      <dd className="fact__value">{value}</dd>
    </div>
  );
}
