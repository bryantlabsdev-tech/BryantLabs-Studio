import { AgentDashboardView } from "@/components/views/AgentDashboardView";
import { AgentRunMetricsView } from "@/components/views/AgentRunMetricsView";
import { ContextInspectorView } from "@/components/views/ContextInspectorView";
import { MemoryView } from "@/components/views/MemoryView";
import { GitView } from "@/components/views/GitView";
import { RepositoryView } from "@/components/views/RepositoryView";
import { useWorkspace } from "@/app/WorkspaceProvider";
import type { InsightsTab } from "@/core/layout/types";

const TABS: ReadonlyArray<{ id: InsightsTab; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "metrics", label: "Metrics" },
  { id: "context", label: "Context" },
  { id: "memory", label: "Memory" },
  { id: "repository", label: "Repository" },
  { id: "git", label: "Git" },
];

/** Consolidated insights: dashboard, context, memory, repository. */
export function InsightsView() {
  const { insightsTab: tab, setInsightsTab: setTab } = useWorkspace();

  return (
    <div className="insights-view">
      <nav className="insights-view__tabs" aria-label="Insights sections">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            className={`insights-view__tab${tab === id ? " insights-view__tab--on" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="insights-view__body">
        {tab === "dashboard" ? <AgentDashboardView /> : null}
        {tab === "metrics" ? <AgentRunMetricsView /> : null}
        {tab === "context" ? <ContextInspectorView /> : null}
        {tab === "memory" ? <MemoryView /> : null}
        {tab === "repository" ? <RepositoryView /> : null}
        {tab === "git" ? <GitView /> : null}
      </div>
    </div>
  );
}
