import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { PatchReviewBulkBar } from "@/components/editor/patchReviewBulkBar";

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("review-first surfaces", () => {
  it("chat exposes only the Review changes chip", () => {
    const chat = source("../views/FollowUpChatHistory.tsx");
    const flow = source("../agent/AgentExecutionFlow.tsx");
    assert.match(chat, /data-testid="agent-review-chip"/);
    assert.match(chat, /AGENT_COPY\.review\.open/);
    assert.doesNotMatch(chat, /Accept all/);
    assert.doesNotMatch(chat, /Reject all/);
    assert.doesNotMatch(chat, /RunReviewActions/);
    assert.match(flow, /data-testid="agent-review-chip"/);
    assert.match(flow, /AGENT_COPY\.review\.open/);
    assert.doesNotMatch(flow, /Accept all/);
    assert.doesNotMatch(flow, /RunReviewActions/);
  });

  it("opening Review changes selects the center Diff workbench", () => {
    const chat = source("../views/FollowUpChatHistory.tsx");
    const workbench = source("../CenterWorkbench.tsx");
    assert.match(chat, /onFocusRunDiff/);
    assert.match(workbench, /planApplyReadyForReview/);
    assert.match(workbench, /setCenterTab/);
  });

  it("center PatchReviewPanel owns a single Accept all, Reject all, and Regenerate", () => {
    const workbench = source("../CenterWorkbench.tsx");
    const panels = workbench.match(/<PatchReviewPanel/g) ?? [];
    assert.equal(panels.length, 1);
    assert.match(workbench, /onAcceptAll=\{/);
    assert.match(workbench, /onRejectAll=\{/);
    assert.match(workbench, /onRegenerate=\{/);
    assert.match(workbench, /continueBuildAfterReview/);
    assert.match(workbench, /cancelBuildLoop/);
    assert.match(workbench, /retryApplyPlanReview/);
    assert.doesNotMatch(workbench, /RunReviewActions/);

    const html = renderToStaticMarkup(
      createElement(PatchReviewBulkBar, {
        busy: false,
        canAcceptAll: true,
        onAcceptAll: () => {},
        onRejectAll: () => {},
        onRegenerate: () => {},
      }),
    );
    assert.equal((html.match(/>Accept all</g) ?? []).length, 1);
    assert.equal((html.match(/>Reject all</g) ?? []).length, 1);
    assert.equal((html.match(/>Regenerate</g) ?? []).length, 1);
  });

  it("does not mount RunReviewActions from live views", () => {
    const runReview = source("../views/RunReviewActions.tsx");
    assert.match(runReview, /export function RunReviewActions/);
    const buildView = source("../views/BuildView.tsx");
    const followUpChat = source("../views/FollowUpChatHistory.tsx");
    const center = source("../CenterWorkbench.tsx");
    assert.doesNotMatch(buildView, /RunReviewActions/);
    assert.doesNotMatch(followUpChat, /RunReviewActions/);
    assert.doesNotMatch(center, /RunReviewActions/);
  });

  it("command palette labels follow the stored review-first state", () => {
    const palette = source("../CommandPalette.tsx");
    assert.match(palette, /Turn off review first/);
    assert.match(palette, /Turn on review first/);
    assert.match(palette, /reviewFirst \? "Turn off review first"/);
  });

  it("regenerate uses the current follow-up auto-continue preference", () => {
    const orchestration = source("../../app/orchestration/useBuildPipelineOrchestration.ts");
    assert.match(orchestration, /resolveFollowUpAutoContinue\(prompt\)/);
    assert.match(orchestration, /host\.cancelApplyPlan\(\)/);
    assert.match(orchestration, /shouldAutoPromoteFollowUpReview/);
  });
});
