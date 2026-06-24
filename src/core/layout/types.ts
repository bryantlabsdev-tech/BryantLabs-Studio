/** BLAI-inspired workspace layout (UI only). */

export type RailTool =
  | "build"
  | "insights"
  | "newapp"
  | "files"
  | "search"
  | "repomap"
  | "repository"
  | "memory"
  | "context"
  | "execution"
  | "builder"
  | "agent"
  | "plan"
  | "patch"
  | "providers"
  | "dashboard"
  | "pipeline"
  | "preview";

export type CenterTab =
  | "editor"
  | "execution"
  | "preview"
  | "generated"
  | "diff"
  | "summary"
  | "studioLog"
  | "inspector"
  | "metrics"
  | "memory";

export type DockTab = "problems" | "terminal" | "verification" | "console";

export type UtilityTab = "plan" | "debug" | "status";

export type InsightsTab =
  | "dashboard"
  | "metrics"
  | "context"
  | "memory"
  | "repository"
  | "git";
