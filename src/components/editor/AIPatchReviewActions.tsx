import type { AIPatchSession } from "@/core/planner/aiTypes";
import { PatchReviewPanel } from "@/components/editor/PatchReviewPanel";

export interface AIPatchReviewActionsProps {
  readonly session: AIPatchSession;
  readonly currentOnDisk: string;
  readonly approved: boolean;
  readonly applyStatus: string;
  readonly applyError: string | null;
  readonly patchError: string | null;
  readonly canUndo: boolean;
  readonly verifyStatus: string;
  readonly onApprove: () => void;
  readonly onDiscardApproval: () => void;
  readonly onApply: () => void;
  readonly onUndo: () => void;
  readonly onVerify: () => void;
  readonly compact?: boolean;
}

/** @deprecated Use PatchReviewPanel directly — kept for existing imports. */
export function AIPatchReviewActions(props: AIPatchReviewActionsProps) {
  return (
    <PatchReviewPanel
      kind="ai_patch"
      session={props.session}
      currentOnDisk={props.currentOnDisk}
      approved={props.approved}
      applyStatus={props.applyStatus}
      applyError={props.applyError}
      patchError={props.patchError}
      canUndo={props.canUndo}
      verifyStatus={props.verifyStatus}
      onApprove={props.onApprove}
      onDiscardApproval={props.onDiscardApproval}
      onApply={props.onApply}
      onUndo={props.onUndo}
      onVerify={props.onVerify}
      {...(props.compact !== undefined ? { compact: props.compact } : {})}
    />
  );
}
