export { useWorkspaceProjectState } from "./useWorkspaceProjectState";
export type { WorkspaceProjectState, FileStatus, ScanStatus, OpenFile } from "./useWorkspaceProjectState";
export { useProjectWorkspace } from "./useProjectWorkspace";
export type { ProjectWorkspaceState } from "./useProjectWorkspace";

export { useGreenfieldRun, isGreenfieldRunBusy } from "./useGreenfieldRun";
export type { GreenfieldRunWorkspaceState } from "./useGreenfieldRun";

export { useAgentRun, useAgentRunWorkspaceContext } from "./useAgentRun";
export type {
  AgentRunWorkspaceState,
  AgentRunWorkspaceContextInput,
} from "./useAgentRun";

export { useWorkspacePlanState, type WorkspacePlanState, type AIPlanStatus } from "./useWorkspacePlanState";
export {
  useWorkspaceOrchestration,
  type WorkspaceOrchestrationBundle,
} from "./useWorkspaceOrchestration";
export {
  useWorkspaceOrchestrationActions,
  type WorkspaceOrchestrationActions,
} from "./useWorkspaceOrchestrationActions";
export { useOrchestrationHostSync } from "./useOrchestrationHostSync";
export { useWorkspaceStudioActions } from "./useWorkspaceStudioActions";
export { useWorkspaceRunContextReset } from "./useWorkspaceRunContextReset";
export { useWorkspacePlanApplyControls } from "./useWorkspacePlanApplyControls";
export { useWorkspaceProjectOpen } from "./useWorkspaceProjectOpen";
export { useWorkspaceFollowUpRecording } from "./useWorkspaceFollowUpRecording";
export { useWorkspaceGreenfieldRunHelpers } from "./useWorkspaceGreenfieldRunHelpers";
export { useWorkspaceRunCheckpointActions } from "./useWorkspaceRunCheckpointActions";
export { useWorkspaceAgentRunGates } from "./useWorkspaceAgentRunGates";
export {
  useWorkspaceContextInspector,
  loadContextHistory,
  type WorkspaceContextInspectorState,
} from "./useWorkspaceContextInspector";
export { useWorkspaceAnalyticsActions } from "./useWorkspaceAnalyticsActions";
export { useWorkspaceAgentMemoryActions } from "./useWorkspaceAgentMemoryActions";
export { useWorkspaceGitWorkspace } from "./useWorkspaceGitWorkspace";
export { useWorkspaceEditSurface } from "./useWorkspaceEditSurface";
export { useWorkspaceAgentSessionActions } from "./useWorkspaceAgentSessionActions";
export { useAgentLoopWorkspaceState } from "./useAgentLoopWorkspaceState";
export type { AgentLoopWorkspaceState } from "./useAgentLoopWorkspaceState";

export { useProviderWorkspaceState } from "./useProviderWorkspaceState";
export type { ProviderWorkspaceState } from "./useProviderWorkspaceState";

export { useProjectMemoryWorkspaceState } from "./useProjectMemoryState";
export type { ProjectMemoryWorkspaceState } from "./useProjectMemoryState";

export { useBuildRunWorkspaceState } from "./useBuildRunState";
export type { BuildRunWorkspaceState } from "./useBuildRunState";

export { usePreviewWorkspaceState, EMPTY_PREVIEW } from "./usePreviewState";
export type { PreviewWorkspaceState, AppPreviewState } from "./usePreviewState";

export { useCheckpointWorkspaceState } from "./useCheckpointState";
export type { CheckpointWorkspaceState } from "./useCheckpointState";

export {
  setLastRoutingIntent,
  getLastRoutingIntent,
  clearLastRoutingIntent,
} from "./routingIntentStore";
export type { RoutingIntentSnapshot } from "./routingIntentStore";

export function isStudioTestMode(): boolean {
  const env = import.meta.env;
  if (!env) return false;
  return (
    env.DEV === true ||
    env.VITE_BRYANTLABS_E2E === "1" ||
    env.MODE === "test"
  );
}
