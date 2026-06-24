import type { SafeEditOrchestrationHost } from "@/app/orchestration/safeEditTypes";
import {
  createPatch,
  isPatchError,
  validatePatch,
  type EditKind,
  type EditParams,
} from "@/core/editor";
import { diffLineStats } from "@/core/planApply";

export function proposeEditOrchestration(
  host: SafeEditOrchestrationHost | null,
  kind: EditKind,
  params: EditParams,
): void {
  if (!host) return;
  if (
    !host.editTarget ||
    !host.activeFile ||
    host.activePath !== host.editTarget.absPath ||
    !host.activeFile.result.readable
  ) {
    host.setEditError("Open the target file before proposing an edit.");
    return;
  }
  const before = host.activeFile.result.content;
  const result = createPatch(kind, before, params, host.editTarget.path);
  if (isPatchError(result)) {
    host.setPendingPatch(null);
    host.setReviewing(false);
    host.setEditError(result.error);
    return;
  }
  const validation = validatePatch(result.before, result.after);
  if (!validation.ok) {
    host.setPendingPatch(null);
    host.setReviewing(false);
    host.setEditError(validation.reason ?? "Invalid edit.");
    return;
  }
  host.setPendingPatch(result);
  host.setReviewing(false);
  host.setEditError(null);
  host.setEditStatus("idle");
}

export async function applyPatchOrchestration(
  host: SafeEditOrchestrationHost | null,
): Promise<void> {
  if (!host?.api || !host.editTarget || !host.pendingPatch || !host.reviewing) {
    return;
  }
  const { editTarget, pendingPatch } = host;
  host.setEditStatus("applying");
  host.setEditError(null);
  const stats = diffLineStats(pendingPatch.before, pendingPatch.after);
  host.beginStudioAction("safe_edit", "safe_edit", "Safe Edit apply started", {
    details: editTarget.path,
    patch: {
      workflow: { editTarget: editTarget.path },
      filesWritten: [],
    },
  });
  try {
    const res = await host.api.applyEdit(
      editTarget.absPath,
      pendingPatch.before,
      pendingPatch.after,
    );
    if (res.ok) {
      host.setEditStatus("applied");
      host.setCanUndo(true);
      host.setLastEditedPath(editTarget.path);
      host.setPendingPatch(null);
      host.setReviewing(false);
      await host.openPath(editTarget.absPath);
      void host.runScan();
      host.finishStudioAction("safe_edit", "safe_edit", true, "Safe Edit applied", {
        details: editTarget.path,
        patch: {
          filesWritten: [editTarget.path],
          workflow: {
            editTarget: editTarget.path,
            filesWritten: [editTarget.path],
            linesAdded: stats.added,
            linesRemoved: stats.removed,
          },
        },
      });
      return;
    }
    host.setEditStatus("error");
    const reason = res.reason ?? "Failed to apply the edit.";
    host.setEditError(reason);
    host.finishStudioAction("safe_edit", "safe_edit", false, "Safe Edit failed", {
      details: reason,
      patch: {
        workflow: {
          editTarget: editTarget.path,
          errors: [reason],
        },
      },
    });
  } catch {
    host.setEditStatus("error");
    host.setEditError("Failed to apply the edit.");
    host.finishStudioAction("safe_edit", "safe_edit", false, "Safe Edit failed", {
      details: "Apply threw",
      patch: {
        workflow: {
          editTarget: editTarget.path,
          errors: ["Failed to apply the edit."],
        },
      },
    });
  }
}

export async function undoLastEditOrchestration(
  host: SafeEditOrchestrationHost | null,
): Promise<void> {
  if (!host?.api) return;
  host.setEditError(null);
  try {
    const res = await host.api.undoLastEdit();
    if (res.ok) {
      host.setCanUndo(false);
      host.setEditStatus("idle");
      host.setLastEditedPath(null);
      if (res.path) await host.openPath(res.path);
      void host.runScan();
      return;
    }
    host.setEditError(res.reason ?? "Nothing to undo.");
  } catch {
    host.setEditError("Failed to undo the last edit.");
  }
}
