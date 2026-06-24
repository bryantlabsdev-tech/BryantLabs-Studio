import { useMemo } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { EmptyState } from "@/components/EmptyState";
import type { ProjectProblem } from "@/core/diagnostics/projectProblems";

function formatLocation(problem: ProjectProblem): string {
  return `${problem.file}:${problem.line}:${problem.column}`;
}

/**
 * Bottom dock "Problems" tab — live TypeScript diagnostics plus Monaco markers.
 */
export function ProblemsView() {
  const {
    project,
    projectProblems,
    problemsStatus,
    refreshProjectProblems,
    openProblem,
  } = useWorkspace();

  const grouped = useMemo(() => {
    const errors = projectProblems.filter((p) => p.severity === "error");
    const warnings = projectProblems.filter((p) => p.severity === "warning");
    return { errors, warnings };
  }, [projectProblems]);

  if (!project) {
    return (
      <div className="problems__empty">
        <EmptyState
          title="No project open"
          description="Open a project to see live TypeScript problems."
        />
      </div>
    );
  }

  const scanning = problemsStatus.state === "scanning";
  const stale = problemsStatus.state === "stale";

  return (
    <div className="problems">
      <div className="problems__bar">
        <button
          type="button"
          className="problems__refresh"
          onClick={() => void refreshProjectProblems()}
          disabled={scanning}
        >
          {scanning ? "Checking…" : "Refresh"}
        </button>
        <span className="problems__counts">
          {problemsStatus.errorCount} error
          {problemsStatus.errorCount === 1 ? "" : "s"}
          {" · "}
          {problemsStatus.warningCount} warning
          {problemsStatus.warningCount === 1 ? "" : "s"}
        </span>
        {stale ? (
          <span className="problems__stale">Results may be stale — rechecking…</span>
        ) : null}
        {problemsStatus.ranAt ? (
          <span className="problems__ranat">
            Updated {new Date(problemsStatus.ranAt).toLocaleTimeString()}
          </span>
        ) : null}
      </div>

      {problemsStatus.error ? (
        <p className="problems__error">{problemsStatus.error}</p>
      ) : null}

      {projectProblems.length === 0 ? (
        <div className="problems__empty">
          <EmptyState
            title={scanning ? "Checking project…" : "No problems"}
            description={
              scanning
                ? "Running tsc --noEmit in the project root."
                : "TypeScript errors and warnings will appear here as you edit."
            }
          />
        </div>
      ) : (
        <div className="problems__lists">
          {grouped.errors.length > 0 ? (
            <ProblemGroup
              title="Errors"
              problems={grouped.errors}
              onOpen={openProblem}
            />
          ) : null}
          {grouped.warnings.length > 0 ? (
            <ProblemGroup
              title="Warnings"
              problems={grouped.warnings}
              onOpen={openProblem}
            />
          ) : null}
        </div>
      )}
    </div>
  );
}

function ProblemGroup(input: {
  readonly title: string;
  readonly problems: readonly ProjectProblem[];
  readonly onOpen: (problem: ProjectProblem) => void;
}) {
  return (
    <section className="problems__group">
      <h3 className="problems__group-title">
        {input.title} ({input.problems.length})
      </h3>
      <ul className="problems__list" role="list">
        {input.problems.map((problem) => (
          <li key={`${problem.source}-${formatLocation(problem)}-${problem.code}`}>
            <button
              type="button"
              className={`problems__item problems__item--${problem.severity}`}
              onClick={() => input.onOpen(problem)}
            >
              <span className="problems__item-source">{problem.source}</span>
              <code className="problems__item-loc">{formatLocation(problem)}</code>
              {problem.code ? (
                <span className="problems__item-code">{problem.code}</span>
              ) : null}
              <span className="problems__item-message">{problem.message}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
