import { useWorkspace } from "@/app/WorkspaceProvider";
import { RAW_GREENFIELD_MUTEX_MESSAGE } from "@/core/agent/agentRunMutex";
import { ViewSuspense } from "@/components/ViewSuspense";
import {
  LazyAIPatchView,
  LazyAgentDashboardView,
  LazyAgentView,
  LazyBuilderView,
  LazyContextInspectorView,
  LazyExecutionView,
  LazyExplorerView,
  LazyInsightsView,
  LazyMemoryView,
  LazyPipelineView,
  LazyPlanComposerView,
  LazyProvidersView,
  LazyRepositoryView,
  LazyRepoMapView,
  LazySearchView,
} from "@/components/lazyViews";

const TOOL_TITLES: Record<string, string> = {
  insights: "Insights",
  newapp: "New App",
  files: "Files",
  search: "Search",
  repomap: "Repo map",
  repository: "Repository",
  memory: "Memory",
  context: "Context",
  execution: "Execution",
  builder: "Builder",
  agent: "Autonomous Agent",
  pipeline: "Pipeline",
  dashboard: "Dashboard",
  plan: "Plan",
  patch: "AI Patch",
  providers: "Settings",
};

/**
 * Right details panel — explorer and power tools (Agent lives in the left column).
 */
export function WorkflowPanel() {
  const { railTool, agentWorkflowBusy } = useWorkspace();
  const title = TOOL_TITLES[railTool] ?? "Sidebar";
  const hideHead = railTool === "files";

  return (
    <section className="panel panel--workflow" aria-label={title}>
      {!hideHead ? (
        <header className="workflow-panel__head">
          <h2 className="workflow-panel__title">{title}</h2>
        </header>
      ) : null}
      <div className="panel__body workflow-panel__body">
        <ViewSuspense>
          {railTool === "insights" ? (
            <LazyInsightsView />
          ) : railTool === "newapp" ? (
            <div className="workflow-panel__agent-redirect">
              <h3 className="workflow-panel__redirect-title">Create apps in Agent</h3>
              <p className="plan__muted">
                Open an empty folder, describe your app in the Agent panel on the left,
                and send. One Agent runs generation, verification, preview, and UI checks
                automatically.
              </p>
              {agentWorkflowBusy ? (
                <p className="plan__muted workflow-panel__mutex">
                  {RAW_GREENFIELD_MUTEX_MESSAGE}
                </p>
              ) : null}
            </div>
          ) : railTool === "files" ? (
            <LazyExplorerView />
          ) : railTool === "search" ? (
            <LazySearchView />
          ) : railTool === "repomap" ? (
            <LazyRepoMapView />
          ) : railTool === "repository" ? (
            <LazyRepositoryView />
          ) : railTool === "memory" ? (
            <LazyMemoryView />
          ) : railTool === "context" ? (
            <LazyContextInspectorView />
          ) : railTool === "execution" ? (
            <LazyExecutionView />
          ) : railTool === "builder" ? (
            <LazyBuilderView />
          ) : railTool === "agent" ? (
            <LazyAgentView />
          ) : railTool === "pipeline" ? (
            <LazyPipelineView />
          ) : railTool === "dashboard" ? (
            <LazyAgentDashboardView />
          ) : railTool === "plan" ? (
            <LazyPlanComposerView />
          ) : railTool === "patch" ? (
            <LazyAIPatchView />
          ) : railTool === "providers" ? (
            <LazyProvidersView />
          ) : (
            <LazyExplorerView />
          )}
        </ViewSuspense>
      </div>
    </section>
  );
}
