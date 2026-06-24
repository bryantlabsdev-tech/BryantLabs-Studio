import { useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { EmptyState } from "@/components/EmptyState";

const EXAMPLES = ["Add dark mode", "Create login page", "Fix navbar spacing"];

/**
 * Sidebar "Plan" view: the prompt input. Submitting builds a deterministic,
 * read-only plan (shown in the Plan panel). No generation, no editing.
 */
export function PlanComposerView() {
  const { project, scan, scanStatus, createPlan, plan } = useWorkspace();
  const [prompt, setPrompt] = useState("");

  if (!project) {
    return (
      <div className="sidebar-section">
        <EmptyState
          title="No project open"
          description="Open a project so the planner can analyze it."
        />
      </div>
    );
  }

  const ready = scan !== null;

  const submit = () => {
    if (!ready || prompt.trim() === "") return;
    createPlan(prompt);
  };

  return (
    <div className="composer">
      <label className="composer__label" htmlFor="plan-prompt">
        Describe a change
      </label>
      <textarea
        id="plan-prompt"
        className="composer__input"
        rows={3}
        spellCheck={false}
        placeholder="e.g. Add dark mode"
        value={prompt}
        disabled={!ready}
        onChange={(e) => setPrompt(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") submit();
        }}
      />

      <div className="composer__examples">
        {EXAMPLES.map((example) => (
          <button
            key={example}
            type="button"
            className="composer__example"
            disabled={!ready}
            onClick={() => setPrompt(example)}
          >
            {example}
          </button>
        ))}
      </div>

      <button
        type="button"
        className="composer__submit"
        disabled={!ready || prompt.trim() === ""}
        onClick={submit}
      >
        Analyze &amp; plan
      </button>

      {!ready ? (
        <p className="composer__hint">
          {scanStatus === "scanning"
            ? "Indexing project… the planner will be ready shortly."
            : "Project index not ready. Re-scan from the Overview tab."}
        </p>
      ) : plan ? (
        <p className="composer__hint composer__hint--ok">
          Plan ready — see the <strong>Plan</strong> panel on the right.
        </p>
      ) : (
        <p className="composer__hint">
          The planner uses the project index to suggest files and reasoning. It
          never edits anything.
        </p>
      )}
    </div>
  );
}
