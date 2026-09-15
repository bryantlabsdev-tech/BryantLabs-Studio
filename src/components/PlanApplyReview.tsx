import { useWorkspace } from "@/app/workspaceContext";
import { PatchReviewPanel } from "@/components/editor/PatchReviewPanel";

/**
 * Multi-file plan apply review — delegates to unified PatchReviewPanel.
 */
export function PlanApplyReview() {
  const {
    planApplySession,
    planApplyError,
    startApplyPlan,
    cancelApplyPlan,
    selectPlanApplyFile,
    setPlanApplyFileDecision,
    setPlanApplyFilePartialContent,
    applyApprovedPlanFiles,
  } = useWorkspace();

  const session = planApplySession;
  if (!session) return null;

  const changedFiles = session.files.filter(
    (file) => file.status === "ready" && file.diffStats?.changed,
  );

  return (
    <PatchReviewPanel
      kind="plan_apply"
      layout="center"
      phase={session.phase}
      planSummary={session.planSummary ?? null}
      changedFiles={changedFiles}
      selectedRelPath={
        session.selectedRelPath ?? changedFiles[0]?.relPath ?? null
      }
      error={planApplyError}
      onAcceptAll={() => {
        void applyApprovedPlanFiles({ approveReadyFiles: true });
      }}
      onRejectAll={() => cancelApplyPlan({ recoverUnapplied: true })}
      onRegenerate={() => void startApplyPlan()}
      onApplyApproved={() => void applyApprovedPlanFiles()}
      onSelectFile={selectPlanApplyFile}
      onAcceptFile={(relPath) => setPlanApplyFileDecision(relPath, "approved")}
      onRejectFile={(relPath) => setPlanApplyFileDecision(relPath, "rejected")}
      onPartialContentChange={setPlanApplyFilePartialContent}
      hunkReview
    />
  );
}
