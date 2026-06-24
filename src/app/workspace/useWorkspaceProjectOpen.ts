import { useCallback } from "react";
import { recordRecentProject } from "@/core/project/recentProjects";
import { EMPTY_PROJECT_MEMORY } from "@/core/projectMemory/types";
import { emptySessionMemory } from "@/core/sessionMemory";
import type { ContextSnapshot } from "@/core/contextInspector";
import type { BryantLabsApi } from "@/types";
import type { EditStatus } from "@/app/workspace/workspaceState";
import type { WorkspacePlanState } from "@/app/workspace/useWorkspacePlanState";
import type { AgentLoopWorkspaceState } from "@/app/workspace/useAgentLoopWorkspaceState";
import type { WorkspaceProjectState } from "@/app/workspace/useWorkspaceProjectState";
import type { ProjectMemoryWorkspaceState } from "@/app/workspace/useProjectMemoryState";

export function useWorkspaceProjectOpen(input: {
  readonly api: BryantLabsApi | null | undefined;
  readonly project: Pick<WorkspaceProjectState, "setProject" | "setError">;
  readonly file: Pick<
    WorkspaceProjectState,
    | "setActiveFile"
    | "setActivePath"
    | "setOpenFileTabs"
    | "setOpenFilesByPath"
    | "setFileStatus"
    | "setScan"
    | "setProjectIndexStatus"
    | "setGitStatus"
    | "setSelectedGitPath"
    | "setGitDiff"
    | "setGitActionError"
    | "setGitDiffError"
  >;
  readonly plan: Pick<
    WorkspacePlanState,
    | "setPlan"
    | "setAiPlan"
    | "setAiPlanStatus"
    | "setLastPlanPrompt"
    | "setPlanApplySession"
    | "setPlanApplyError"
    | "setAutoFixSession"
    | "setExecutionSession"
    | "setExecutionError"
    | "setBuilderSession"
    | "setBuilderError"
    | "builderControlRef"
    | "builderSkipApprovalRef"
    | "setAiPatchSession"
    | "setPatchStatus"
    | "setPatchError"
    | "setAiPatchApproved"
    | "setAiPatchApplyStatus"
    | "setAiPatchApplyError"
  >;
  readonly agentLoop: Pick<AgentLoopWorkspaceState, "setAgentSession">;
  readonly memory: Pick<
    ProjectMemoryWorkspaceState,
    "setProjectMemory" | "setProjectMemoryError"
  >;
  readonly setSessionMemory: React.Dispatch<
    React.SetStateAction<import("@/core/sessionMemory").SessionMemorySnapshot>
  >;
  readonly setSessionMemoryDiagnostics: React.Dispatch<
    React.SetStateAction<import("@/core/sessionMemory").SessionMemoryDiagnostics | null>
  >;
  readonly setContextSnapshot: React.Dispatch<React.SetStateAction<ContextSnapshot | null>>;
  readonly setContextInspectorDraft: React.Dispatch<
    React.SetStateAction<ContextSnapshot | null>
  >;
  readonly setContextHistory: React.Dispatch<React.SetStateAction<ContextSnapshot[]>>;
  readonly setSelectedContextId: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setEditTarget: React.Dispatch<
    React.SetStateAction<import("@/app/workspace/workspaceState").EditTarget | null>
  >;
  readonly setPendingPatch: React.Dispatch<
    React.SetStateAction<import("@/core/editor").Patch | null>
  >;
  readonly setReviewing: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setEditStatus: React.Dispatch<React.SetStateAction<EditStatus>>;
  readonly setEditError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setCanUndo: React.Dispatch<React.SetStateAction<boolean>>;
  readonly setVerification: React.Dispatch<
    React.SetStateAction<import("@/types").VerificationResult | null>
  >;
  readonly setVerifyStatus: React.Dispatch<
    React.SetStateAction<"idle" | "running" | "done" | "error">
  >;
  readonly setVerifyError: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setLastEditedPath: React.Dispatch<React.SetStateAction<string | null>>;
  readonly runScan: () => Promise<void>;
  readonly bindProjectSession: (path: string, name: string) => Promise<void>;
}) {
  const resetWorkspaceForProject = useCallback(() => {
    input.file.setActiveFile(null);
    input.file.setActivePath(null);
    input.file.setOpenFileTabs([]);
    input.file.setOpenFilesByPath({});
    input.file.setFileStatus("idle");
    input.file.setScan(null);
    input.file.setProjectIndexStatus(null);
    input.plan.setPlan(null);
    input.plan.setAiPlan(null);
    input.plan.setAiPlanStatus("idle");
    input.plan.setLastPlanPrompt(null);
    input.plan.setPlanApplySession(null);
    input.plan.setPlanApplyError(null);
    input.plan.setAutoFixSession(null);
    input.setSessionMemory(emptySessionMemory());
    input.setSessionMemoryDiagnostics(null);
    input.memory.setProjectMemory(EMPTY_PROJECT_MEMORY);
    input.memory.setProjectMemoryError(null);
    input.setContextSnapshot(null);
    input.setContextInspectorDraft(null);
    input.setContextHistory([]);
    input.setSelectedContextId(null);
    input.plan.setExecutionSession(null);
    input.plan.setExecutionError(null);
    input.plan.setBuilderSession(null);
    input.plan.setBuilderError(null);
    input.plan.builderControlRef.current = { paused: false, stopped: false };
    input.plan.builderSkipApprovalRef.current = null;
    input.agentLoop.setAgentSession(null);
    input.plan.setAiPatchSession(null);
    input.plan.setPatchStatus("idle");
    input.plan.setPatchError(null);
    input.plan.setAiPatchApproved(false);
    input.plan.setAiPatchApplyStatus("idle");
    input.plan.setAiPatchApplyError(null);
    input.setEditTarget(null);
    input.setPendingPatch(null);
    input.setReviewing(false);
    input.setEditStatus("idle");
    input.setEditError(null);
    input.setCanUndo(false);
    input.setVerification(null);
    input.setVerifyStatus("idle");
    input.file.setGitStatus(null);
    input.file.setSelectedGitPath(null);
    input.file.setGitDiff(null);
    input.file.setGitActionError(null);
    input.file.setGitDiffError(null);
    input.setVerifyError(null);
    input.setLastEditedPath(null);
  }, [input]);

  const openProject = useCallback(async () => {
    if (!input.api) {
      input.project.setError("Opening a project requires the desktop app.");
      return;
    }
    input.project.setError(null);
    const result = await input.api.openProject();
    if (result) {
      input.project.setProject(result);
      recordRecentProject(result.path, result.name);
      resetWorkspaceForProject();
      void input.runScan();
      void input.bindProjectSession(result.path, result.name);
    }
  }, [input, resetWorkspaceForProject]);

  const openProjectAt = useCallback(
    async (folderPath: string) => {
      if (!input.api) return;
      input.project.setError(null);
      const result = await input.api.openProjectAt(folderPath);
      if (result) {
        input.project.setProject(result);
        recordRecentProject(result.path, result.name);
        resetWorkspaceForProject();
        void input.runScan();
        void input.bindProjectSession(result.path, result.name);
      }
    },
    [input, resetWorkspaceForProject],
  );

  return {
    resetWorkspaceForProject,
    openProject,
    openProjectAt,
  };
}
