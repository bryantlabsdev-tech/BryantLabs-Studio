import type { RunReviewProps } from "@/components/views/RunConversationBlock";
import { PatchReviewPanel } from "@/components/editor/PatchReviewPanel";

export function RunReviewActions({ review }: { readonly review: RunReviewProps }) {
  return (
    <div data-testid="run-review-actions">
      <PatchReviewPanel
        kind="plan_apply"
        layout="chat"
        phase="waiting_for_review"
        planSummary={review.planSummary ?? null}
        changedFiles={review.changedFiles}
        selectedRelPath={review.changedFiles[0]?.relPath ?? null}
        error={null}
        acceptLabel="Accept all"
        rejectLabel="Reject all"
        onAcceptAll={review.onApprove}
        onRejectAll={review.onReject}
        onRegenerate={review.onRevision}
        {...(review.onAcceptFile ? { onAcceptFile: review.onAcceptFile } : {})}
        {...(review.onRejectFile ? { onRejectFile: review.onRejectFile } : {})}
        {...(review.onPartialContentChange
          ? {
              onPartialContentChange: review.onPartialContentChange,
              hunkReview: true,
            }
          : {})}
      />
    </div>
  );
}
