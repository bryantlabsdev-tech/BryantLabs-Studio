import { lazy } from "react";

export const LazyInsightsView = lazy(() =>
  import("@/components/views/InsightsView").then((m) => ({ default: m.InsightsView })),
);
export const LazyNewAppView = lazy(() =>
  import("@/components/views/NewAppView").then((m) => ({ default: m.NewAppView })),
);
export const LazyExplorerView = lazy(() =>
  import("@/components/views/ExplorerView").then((m) => ({ default: m.ExplorerView })),
);
export const LazySearchView = lazy(() =>
  import("@/components/views/SearchView").then((m) => ({ default: m.SearchView })),
);
export const LazyRepositoryView = lazy(() =>
  import("@/components/views/RepositoryView").then((m) => ({ default: m.RepositoryView })),
);
export const LazyRepoMapView = lazy(() =>
  import("@/components/views/RepoMapView").then((m) => ({ default: m.RepoMapView })),
);
export const LazyMemoryView = lazy(() =>
  import("@/components/views/MemoryView").then((m) => ({ default: m.MemoryView })),
);
export const LazyContextInspectorView = lazy(() =>
  import("@/components/views/ContextInspectorView").then((m) => ({
    default: m.ContextInspectorView,
  })),
);
export const LazyExecutionView = lazy(() =>
  import("@/components/views/ExecutionView").then((m) => ({ default: m.ExecutionView })),
);
export const LazyBuilderView = lazy(() =>
  import("@/components/views/BuilderView").then((m) => ({ default: m.BuilderView })),
);
export const LazyAgentView = lazy(() =>
  import("@/components/views/AgentView").then((m) => ({ default: m.AgentView })),
);
export const LazyPipelineView = lazy(() =>
  import("@/components/views/PipelineView").then((m) => ({ default: m.PipelineView })),
);
export const LazyAgentDashboardView = lazy(() =>
  import("@/components/views/AgentDashboardView").then((m) => ({
    default: m.AgentDashboardView,
  })),
);
export const LazyPlanComposerView = lazy(() =>
  import("@/components/views/PlanComposerView").then((m) => ({
    default: m.PlanComposerView,
  })),
);
export const LazyAIPatchView = lazy(() =>
  import("@/components/views/AIPatchView").then((m) => ({ default: m.AIPatchView })),
);
export const LazyProvidersView = lazy(() =>
  import("@/components/views/ProvidersView").then((m) => ({ default: m.ProvidersView })),
);
export const LazyBuildView = lazy(() =>
  import("@/components/views/BuildView").then((m) => ({ default: m.BuildView })),
);
export const LazyExecutionDashboard = lazy(() =>
  import("@/components/views/ExecutionDashboard").then((m) => ({
    default: m.ExecutionDashboard,
  })),
);
export const LazyPreviewView = lazy(() =>
  import("@/components/views/PreviewView").then((m) => ({ default: m.PreviewView })),
);
export const LazyGeneratedFilesView = lazy(() =>
  import("@/components/views/GeneratedFilesView").then((m) => ({
    default: m.GeneratedFilesView,
  })),
);
export const LazyGreenfieldSummaryView = lazy(() =>
  import("@/components/views/GreenfieldSummaryView").then((m) => ({
    default: m.GreenfieldSummaryView,
  })),
);
export const LazyGreenfieldLogsView = lazy(() =>
  import("@/components/views/GreenfieldLogsView").then((m) => ({
    default: m.GreenfieldLogsView,
  })),
);
export const LazyGreenfieldInspectorView = lazy(() =>
  import("@/components/views/GreenfieldInspectorView").then((m) => ({
    default: m.GreenfieldInspectorView,
  })),
);
export const LazyConsoleView = lazy(() =>
  import("@/components/views/ConsoleView").then((m) => ({ default: m.ConsoleView })),
);
