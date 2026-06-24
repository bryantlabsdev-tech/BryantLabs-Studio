import { useMemo } from "react";
import type { CurrentAppContext } from "@/core/agent/agentAppContext";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import type { ProjectScan } from "@/types";

interface ProjectMemoryPanelProps {
  context: CurrentAppContext | null;
  scan?: ProjectScan | null;
  runHistory?: readonly AgentRunArtifact[];
}

function keyFilesFromScan(scan: ProjectScan | null | undefined): string[] {
  if (!scan) return [];
  const entry = scan.summary.entryPoints[0];
  const candidates = [
    entry,
    "src/App.tsx",
    "src/index.css",
    "src/main.tsx",
    "index.html",
  ].filter(Boolean) as string[];

  const existing = new Set(scan.files.map((file) => file.path));
  return [...new Set(candidates)].filter((path) => existing.has(path)).slice(0, 6);
}

export function ProjectMemoryPanel({
  context,
  scan = null,
  runHistory = [],
}: ProjectMemoryPanelProps) {
  const recentChanges = useMemo(
    () =>
      [...runHistory]
        .sort((a, b) => b.runNumber - a.runNumber)
        .slice(0, 5)
        .map((run) => run.prompt.trim())
        .filter(Boolean),
    [runHistory],
  );

  const keyFiles = useMemo(() => {
    const fromRuns = [...runHistory]
      .flatMap((run) => run.filesModified)
      .slice(-8)
      .reverse();
    const unique = [...new Set([...keyFilesFromScan(scan), ...fromRuns])];
    return unique.slice(0, 6);
  }, [runHistory, scan]);

  const detectedStack = useMemo(() => {
    if (context?.stack?.trim()) return context.stack;
    if (!scan) return "Unknown stack";
    const { framework, bundler, language } = scan.summary;
    return [framework, bundler, language].filter(Boolean).join(" + ");
  }, [context?.stack, scan]);

  if (!context && !scan && runHistory.length === 0) return null;

  return (
    <section className="project-memory project-memory--agent" aria-label="Project memory">
      <h4 className="project-memory__heading">What agent knows</h4>
      {context?.appName ? (
        <p className="project-memory__app-name">{context.appName}</p>
      ) : null}
      <div className="project-memory__facts">
        <p className="project-memory__facts-label">Detected stack</p>
        <p className="project-memory__stack">{detectedStack}</p>
      </div>
      {keyFiles.length > 0 ? (
        <div className="project-memory__facts">
          <p className="project-memory__facts-label">Key files</p>
          <ul className="project-memory__list">
            {keyFiles.map((file) => (
              <li key={file} className="project-memory__fact">
                {file}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {recentChanges.length > 0 ? (
        <div className="project-memory__facts">
          <p className="project-memory__facts-label">Recent changes</p>
          <ul className="project-memory__list">
            {recentChanges.map((change) => (
              <li key={change} className="project-memory__fact project-memory__fact--ok">
                {change}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      {context?.features.length ? (
        <div className="project-memory__features">
          <p className="project-memory__features-label">Features</p>
          <ul className="project-memory__list">
            {context.features.map((feature) => (
              <li key={feature} className="project-memory__fact project-memory__fact--ok">
                {feature}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
