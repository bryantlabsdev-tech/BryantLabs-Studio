import { useWorkspace } from "@/app/WorkspaceProvider";
import { useEffectiveGreenfieldRun } from "@/app/workspace/useEffectiveGreenfieldRun";
import { HistoricalRunBanner } from "@/components/views/HistoricalRunBanner";
import { GREENFIELD_FILE_PATHS } from "@/core/greenfield";
import { EmptyState } from "@/components/EmptyState";

/**
 * Center tab: greenfield generated files (read-only list + snippet).
 */
export function GeneratedFilesView() {
  const { selectAgentRun } = useWorkspace();
  const { snapshot: greenfieldRun, viewingHistorical, selectedArtifact } =
    useEffectiveGreenfieldRun();
  const files = greenfieldRun.generatedFiles;

  if (viewingHistorical && selectedArtifact && selectedArtifact.filesModified.length > 0) {
    return (
      <div className="gen-files">
        <HistoricalRunBanner
          artifact={selectedArtifact}
          onBackToLive={() => selectAgentRun(null)}
        />
        <p className="gen-files__meta">
          {selectedArtifact.filesModified.length} file
          {selectedArtifact.filesModified.length === 1 ? "" : "s"} modified in this run
        </p>
        <ul className="gen-files__list">
          {selectedArtifact.filesModified.map((path) => (
            <li key={path} className="gen-files__item">
              <span className="gen-files__path">{path}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }

  if (!files?.length) {
    return (
      <EmptyState
        title="No generated files"
        description="Run New App generation to see the seven proposed files here."
      />
    );
  }

  const selected = files[0];

  return (
    <div className="gen-files">
      <p className="gen-files__meta">
        {files.length} of {GREENFIELD_FILE_PATHS.length} files
      </p>
      <ul className="gen-files__list">
        {GREENFIELD_FILE_PATHS.map((p) => {
          const f = files.find((x) => x.path === p);
          return (
            <li key={p} className={`gen-files__item${f ? "" : " gen-files__item--miss"}`}>
              <span className="gen-files__path">{p}</span>
              <span className="gen-files__size">
                {f ? `${f.content.length} chars` : "missing"}
              </span>
            </li>
          );
        })}
      </ul>
      {selected ? (
        <>
          <h4 className="gen-files__heading">Preview: {selected.path}</h4>
          <pre className="gen-files__pre">{selected.content.slice(0, 1200)}</pre>
        </>
      ) : null}
    </div>
  );
}
