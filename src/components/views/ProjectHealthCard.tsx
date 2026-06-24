import type { ProjectHealthSnapshot } from "@/core/build/projectHealth";

interface ProjectHealthCardProps {
  health: ProjectHealthSnapshot | null;
}

export function ProjectHealthCard({ health }: ProjectHealthCardProps) {
  if (!health) return null;

  return (
    <section className="project-health" aria-label="Project health">
      <h4 className="build-view__heading">
        Project Health: {health.score.toFixed(1)}/10
      </h4>
      <ul className="project-health__list">
        <li>{health.typecheckOk ? "✓" : "✗"} TypeScript</li>
        <li>{health.buildOk ? "✓" : "✗"} Build</li>
        <li>{health.previewOk ? "✓" : "✗"} Preview</li>
        <li>Warnings {health.warnings}</li>
        <li>Errors {health.errors}</li>
      </ul>
    </section>
  );
}
