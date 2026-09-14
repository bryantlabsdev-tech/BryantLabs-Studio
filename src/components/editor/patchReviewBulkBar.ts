import { createElement, type ReactNode } from "react";

export interface PatchReviewBulkBarProps {
  readonly busy: boolean;
  readonly canAcceptAll: boolean;
  readonly onAcceptAll: () => void;
  readonly onRejectAll: () => void;
  readonly onRegenerate: () => void;
  readonly acceptLabel?: string;
  readonly rejectLabel?: string;
}

export function PatchReviewBulkBar({
  busy,
  canAcceptAll,
  onAcceptAll,
  onRejectAll,
  onRegenerate,
  acceptLabel = "Accept all",
  rejectLabel = "Reject all",
}: PatchReviewBulkBarProps): ReactNode {
  return createElement(
    "div",
    { className: "patch-review__bulk-actions agent-patch-review__bulk-actions" },
    canAcceptAll
      ? createElement(
          "button",
          {
            type: "button",
            className: "prov-btn prov-btn--primary",
            disabled: busy,
            onClick: onAcceptAll,
          },
          acceptLabel,
        )
      : null,
    createElement(
      "button",
      {
        type: "button",
        className: "prov-btn",
        disabled: busy,
        onClick: onRejectAll,
      },
      rejectLabel,
    ),
    createElement(
      "button",
      {
        type: "button",
        className: "build-view__link",
        disabled: busy,
        onClick: onRegenerate,
      },
      "Regenerate",
    ),
  );
}
