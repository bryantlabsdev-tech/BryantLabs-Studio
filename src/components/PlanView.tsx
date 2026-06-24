import type { Plan } from "@/core/planner";
import { useWorkspace } from "@/app/WorkspaceProvider";

interface PlanViewProps {
  plan: Plan;
}

/**
 * Renders a read-only modification plan: summary, confidence/impact, proposed
 * changes, and the ranked list of likely-affected files with reasoning.
 * Nothing here writes or generates code.
 */
export function PlanView({ plan }: PlanViewProps) {
  const { openPath, selectEditTarget } = useWorkspace();

  return (
    <div className="plan">
      <div className="plan__head">
        <span className="plan__intent">{plan.intent}</span>
        <span className={`badge badge--conf-${plan.confidence.toLowerCase()}`}>
          Confidence: {plan.confidence}
        </span>
        <span className={`badge badge--impact-${plan.impact.toLowerCase()}`}>
          Impact: {plan.impact}
        </span>
      </div>

      <p className="plan__prompt">“{plan.prompt}”</p>
      <p className="plan__summary">{plan.summary}</p>

      <section className="plan__block">
        <h3 className="plan__heading">Proposed changes</h3>
        <ul className="plan__changes">
          {plan.proposedChanges.map((change, i) => (
            <li key={i}>{change}</li>
          ))}
        </ul>
      </section>

      <section className="plan__block">
        <h3 className="plan__heading">
          Files likely affected{" "}
          <span className="plan__count">{plan.files.length}</span>
        </h3>
        {plan.files.length === 0 ? (
          <p className="plan__muted">
            {plan.usedFallback
              ? "Using fallback file selection — re-scan the project if this list looks wrong."
              : "No indexed files in the project yet — open a folder and run Scan."}
          </p>
        ) : (
          <ul className="plan__files">
            {plan.files.map((file) => (
              <li key={file.absPath} className="plan-file">
                <div className="plan-file__head">
                  <button
                    type="button"
                    className="plan-file__open"
                    onClick={() => void openPath(file.absPath)}
                    title={`Open ${file.path}`}
                  >
                    <span className="plan-file__path">{file.path}</span>
                    <span className="plan-file__score">{file.score}</span>
                  </button>
                  <button
                    type="button"
                    className="plan-file__edit"
                    onClick={() =>
                      selectEditTarget({ path: file.path, absPath: file.absPath })
                    }
                    title="Select this file for a deterministic edit"
                  >
                    Edit
                  </button>
                </div>
                <ul className="plan-file__reasons">
                  {file.reasons.map((reason, i) => (
                    <li key={i}>{reason}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </section>

      <p className="plan__readonly">
        This is a read-only plan. No files have been or will be modified.
      </p>
    </div>
  );
}
