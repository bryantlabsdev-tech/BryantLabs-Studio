import type { ProjectDetections } from "@/types";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { IndexStatus } from "@/components/IndexStatus";
import { EmptyState } from "@/components/EmptyState";

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
 * Sidebar "Overview" view: project summary, framework/config detections, and
 * the code index status. All values come straight from the read-only scanner.
 */
export function OverviewView() {
  const { project, scan, scanStatus, rescan } = useWorkspace();

  if (!project) {
    return (
      <div className="sidebar-section">
        <EmptyState
          title="No project open"
          description="Open a project to see its overview."
        />
      </div>
    );
  }

  const summary = scan?.summary;

  return (
    <div className="overview">
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

      {summary ? (
        <>
          <dl className="facts">
            <Fact label="Project" value={summary.name} />
            <Fact label="Framework" value={summary.framework} />
            <Fact label="Language" value={summary.language} />
            <Fact label="Package manager" value={summary.packageManager} />
            <Fact label="Total files" value={String(summary.totalFiles)} />
            <Fact label="Total folders" value={String(summary.totalFolders)} />
          </dl>

          <section className="overview__block">
            <h3 className="overview__heading">Entry points</h3>
            {summary.entryPoints.length > 0 ? (
              <ul className="chips chips--paths">
                {summary.entryPoints.map((entry) => (
                  <li key={entry} className="chip chip--path">
                    {entry}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="overview__muted">None detected.</p>
            )}
          </section>

          <section className="overview__block">
            <h3 className="overview__heading">Detections</h3>
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
        </>
      ) : scanStatus === "scanning" ? (
        <p className="overview__muted">Scanning project…</p>
      ) : scanStatus === "error" ? (
        <p className="overview__muted">Scan failed. Try Re-scan.</p>
      ) : (
        <p className="overview__muted">Not scanned yet.</p>
      )}
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
