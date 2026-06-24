import { useEffect, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { PlanComparisonView } from "@/components/PlanComparisonView";
import { ProvidersView } from "@/components/views/ProvidersView";
import { AIPatchView } from "@/components/views/AIPatchView";
import { PreviewView } from "@/components/views/PreviewView";
import { EmptyState } from "@/components/EmptyState";

type RightTab = "plan" | "patch" | "providers" | "preview";

const TABS: ReadonlyArray<{ id: RightTab; label: string }> = [
  { id: "plan", label: "Plan" },
  { id: "patch", label: "AI Patch" },
  { id: "providers", label: "Providers" },
  { id: "preview", label: "Preview" },
];

/**
 * Right column. A tabbed panel hosting the Plan Viewer and the (placeholder)
 * Preview. Switches to the Plan tab automatically when a new plan is built.
 */
export function RightPanel() {
  const { plan, previewTabNonce } = useWorkspace();
  const [tab, setTab] = useState<RightTab>("plan");

  useEffect(() => {
    if (plan) setTab("plan");
  }, [plan]);

  useEffect(() => {
    if (previewTabNonce > 0) setTab("preview");
  }, [previewTabNonce]);

  return (
    <section className="panel panel--right" aria-label="Plan and preview">
      <header className="sidebar__tabs" role="tablist">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`sidebar__tab${tab === id ? " sidebar__tab--active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </header>
      <div className="panel__body panel--right__body">
        {tab === "plan" ? (
          plan ? (
            <PlanComparisonView plan={plan} />
          ) : (
            <EmptyState
              title="No plan yet"
              description="Open the Plan tab in the sidebar, describe a change, and analyze it. The deterministic plan appears here, and you can compare it with an AI plan."
            />
          )
        ) : tab === "patch" ? (
          <AIPatchView />
        ) : tab === "providers" ? (
          <ProvidersView />
        ) : (
          <PreviewView />
        )}
      </div>
    </section>
  );
}
