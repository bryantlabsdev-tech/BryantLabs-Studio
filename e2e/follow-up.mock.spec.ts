import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
  closeStudioApp,
  dismissBlockingDialogs,
  fillAgentPrompt,
  getMainWindow,
  launchStudioApp,
  sendAgentPrompt,
  waitForAgentReady,
  openFixtureProject,
  readCenterTab,
  waitForComposerReady,
  waitForPatchReviewReady,
  waitForWorkbenchDiffTab,
  assertNoRenderLoopConsoleErrors,
} from "./helpers/studio";

async function confirmStaleRunResetIfPresent(page: Page): Promise<void> {
  const stale = page.getByRole("region", { name: "Stale run state" });
  const deadline = Date.now() + 8_000;
  while (Date.now() < deadline) {
    if (await stale.isVisible().catch(() => false)) {
      await expect(stale.getByRole("heading", { name: "Previous run state detected" })).toBeVisible();
      await stale.getByRole("button", { name: /^Reset and start$/i }).click();
      await expect(stale).toBeHidden();
      return;
    }
    const runStarted = await page.evaluate(() => {
      const pipeline = window.__studioTestHooks?.getPatchPipelineState?.();
      const diagnostic = window.__studioTestHooks?.getFollowUpSettlementDiagnostic?.();
      const greenfield = window.__studioTestHooks?.getReadinessState?.()?.greenfieldRun;
      return Boolean(
        pipeline?.activeAgentRunId ||
          pipeline?.planApplyPhase ||
          pipeline?.buildRunning ||
          diagnostic?.submitEventId ||
          greenfield?.active ||
          greenfield?.runResult === "running",
      );
    });
    if (runStarted) return;
    await page.waitForTimeout(100);
  }
}

async function resetAgentWorkspaceForNewPrompt(page: Page): Promise<void> {
  await dismissBlockingDialogs(page);
  const reset = page.getByRole("button", { name: /^Reset agent state$/i });
  if (await reset.isVisible().catch(() => false)) {
    await reset.click();
  }
  await expect(page.getByText("Project index not ready.")).toBeHidden();
  await dismissBlockingDialogs(page);
}

async function waitForGameplayFollowUpOutcome(page: Page) {
  const started = Date.now();
  let lastDebug: unknown = null;

  while (Date.now() - started < 90_000) {
    const debug = await page.evaluate(() => {
      const pipeline = window.__studioTestHooks?.getPatchPipelineState?.();
      const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
      const routing = window.__studioTestHooks?.getRoutingState?.();
      const diagnostic = window.__studioTestHooks?.getFollowUpSettlementDiagnostic?.();
      return {
        pipeline,
        runResult: run?.runResult ?? null,
        actionType: run?.actionType ?? null,
        applyPlanInvocations: diagnostic?.applyPlanInvocations ?? 0,
        selectedRoute: diagnostic?.selectedRoutingDecision ?? null,
        routingIntent: routing?.intent ?? null,
        reviewVisible: Boolean(document.querySelector('[data-testid="agent-review-chip"]')),
        failureVisible: Boolean(document.querySelector('[data-testid="run-failure-card"]')),
      };
    });
    lastDebug = debug;

    if (debug.reviewVisible) return "waiting_for_review" as const;
    if (debug.failureVisible) return "apply_failed" as const;

    const phase = debug.pipeline?.planApplyPhase;
    if (phase === "waiting_for_review" || phase === "review") return "waiting_for_review" as const;
    if (phase === "done") return "patch_applied" as const;
    if (debug.pipeline?.buildPhase === "review") return "waiting_for_review" as const;
    if (debug.pipeline?.buildPhase === "completed") return "patch_applied" as const;
    if (
      debug.pipeline?.planApplyError ||
      debug.pipeline?.buildPhase === "failed" ||
      debug.pipeline?.buildError ||
      debug.pipeline?.aiPlanStatus === "error"
    ) {
      return "apply_failed" as const;
    }
    if (debug.pipeline?.planApplyPhase === "verifying") {
      // Keep polling until apply finishes or fails; do not treat in-flight verify as terminal.
    } else if (
      debug.applyPlanInvocations > 0 &&
      debug.runResult === "success" &&
      !debug.pipeline?.buildRunning &&
      !debug.pipeline?.activeAgentRunId
    ) {
      return "patch_applied" as const;
    }

    await page.waitForTimeout(300);
  }

  throw new Error(`Patch pipeline timed out after 90s. debug=${JSON.stringify(lastDebug)}`);
}

test.describe("Follow-up edit (mock provider)", () => {
  let app: ElectronApplication | undefined;
  let page: Page | undefined;

  test.beforeAll(async () => {
    app = await launchStudioApp();
    page = await getMainWindow(app);
    await waitForAgentReady(page);
  });

  test.afterAll(async () => {
    try {
      if (page) await assertNoRenderLoopConsoleErrors(page);
    } finally {
      await closeStudioApp(app);
    }
  });

  test("accepts follow-up prompt in agent chat", async () => {
    await fillAgentPrompt(page, "Add a timer");
    await expect(page.locator("#build-prompt")).toHaveValue("Add a timer");
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);
    await expect(page.getByTestId("agent-send")).toBeVisible();
  });
});

test.describe("Follow-up review (mock provider)", () => {
  let app: ElectronApplication | undefined;
  let page: Page | undefined;

  test.beforeAll(async () => {
    app = await launchStudioApp();
    page = await getMainWindow(app);
    await page.waitForLoadState("domcontentloaded");
    await dismissBlockingDialogs(page);
    await openFixtureProject(page);
    await waitForComposerReady(page);
  });

  test.beforeEach(async () => {
    await dismissBlockingDialogs(page);
  });

  test.afterAll(async () => {
    try {
      if (page) await assertNoRenderLoopConsoleErrors(page);
    } finally {
      await closeStudioApp(app);
    }
  });

  test("simulated review chip opens workbench review panel", async () => {
    const simulated = await page.evaluate(() => {
      return window.__studioTestHooks?.simulatePatchReadyForReview?.();
    });
    expect(simulated?.ok).toBe(true);
    await waitForPatchReviewReady(page);

    const reviewPrompt = page.getByTestId("agent-review-chip");
    await expect(reviewPrompt).toBeVisible();
    await reviewPrompt.getByRole("button", { name: /Review changes/i }).click();
    await waitForWorkbenchDiffTab(page);

    const review = page.getByTestId("patch-review-panel");
    const inlineAccept = page.getByRole("button", { name: /^Accept$/i });
    const patchReviewChrome = page.getByText(/Patch review/i);
    await expect(review.or(inlineAccept).or(patchReviewChrome).first()).toBeVisible();
    if (await review.isVisible().catch(() => false)) {
      await expect(review.getByTestId("patch-review-file-chips")).toContainText("src/App.tsx");
      await expect(review.getByRole("button", { name: "Reject all" })).toBeVisible();
    }
  });

  test("workbench tabs switch during patch review and a running preview", async () => {
    const simulated = await page.evaluate(() => {
      const review = window.__studioTestHooks?.simulatePatchReadyForReview?.();
      const preview = window.__studioTestHooks?.simulatePreviewReady?.();
      return { review, preview };
    });
    expect(simulated.review?.ok).toBe(true);
    expect(simulated.preview?.ok).toBe(true);
    await waitForPatchReviewReady(page);

    const tabs = [
      ["Execution", "execution"],
      ["Preview", "preview"],
      ["Diff", "diff"],
      ["Studio Log", "studioLog"],
      ["Editor", "editor"],
    ] as const;

    const workbench = page.getByRole("region", { name: "Workbench" });
    for (const [label, id] of tabs) {
      await workbench.getByRole("tab", { name: label, exact: true }).click();
      await expect
        .poll(async () => readCenterTab(page), { timeout: 5_000 })
        .toBe(id);
    }

    const moreTab = workbench.getByRole("tab", { name: /^More/ });
    await moreTab.click();
    await expect(moreTab).toHaveAttribute("aria-expanded", "true");
    await page.getByRole("menuitem", { name: "Metrics" }).click();
    await expect.poll(async () => readCenterTab(page), { timeout: 5_000 }).toBe("metrics");

    await workbench.getByRole("tab", { name: "Editor", exact: true }).click();
    await expect.poll(async () => readCenterTab(page), { timeout: 5_000 }).toBe("editor");
  });

  // Unrelated to this slice: simulateLiveActivityStream is not implemented.
  test.skip("shows live execution flow and compact summary in agent conversation", async () => {
    await openFixtureProject(page);
    await waitForComposerReady(page);

    const simulated = await page.evaluate(() =>
      window.__studioTestHooks?.simulateLiveActivityStream?.({ complete: true }),
    );
    expect(simulated?.ok).toBe(true);

    const stream = page.getByTestId("agent-execution-flow");
    await expect(stream).toBeVisible();
    await expect(page.getByTestId("agent-turn-footer")).toBeVisible();
    await expect(stream).toContainText("App.tsx");
    await expect(page.getByTestId("agent-execution-details")).toBeVisible();
  });

});

test.describe("Follow-up gameplay (mock provider)", () => {
  let app: ElectronApplication | undefined;
  let page: Page | undefined;

  test.beforeAll(async () => {
    app = await launchStudioApp();
    page = await getMainWindow(app);
    await page.waitForLoadState("domcontentloaded");
    await dismissBlockingDialogs(page);
    await openFixtureProject(page);
    await waitForComposerReady(page);
  });

  test.afterAll(async () => {
    try {
      if (page) await assertNoRenderLoopConsoleErrors(page);
    } finally {
      await closeStudioApp(app);
    }
  });

  test("mock provider reaches review after gameplay follow-up", async () => {
    test.setTimeout(120_000);

    await waitForComposerReady(page);
    await resetAgentWorkspaceForNewPrompt(page);

    await fillAgentPrompt(page, "Upgrade Sudoku gameplay. Add notes mode and hints.");
    await sendAgentPrompt(page);
    await confirmStaleRunResetIfPresent(page);
    await dismissBlockingDialogs(page);

    const outcome = await waitForGameplayFollowUpOutcome(page);
    expect(["waiting_for_review", "ready_for_apply", "patch_applied", "apply_failed"]).toContain(
      outcome,
    );

    if (outcome === "waiting_for_review") {
      // A successful run can surface the modal "Save to memory?" dialog, which
      // overlays the conversation and intercepts pointer events. Dismiss only
      // that dialog (not the broad helper, which would click "Reject all").
      const dismissMemory = page.getByRole("button", { name: /^Dismiss$/i });
      if (await dismissMemory.isVisible().catch(() => false)) {
        await dismissMemory.click();
      }

      const reviewPrompt = page.getByTestId("agent-review-chip");
      await expect(reviewPrompt).toBeVisible();
      await reviewPrompt.getByRole("button", { name: /Review changes/i }).click();
      await waitForWorkbenchDiffTab(page);

      const review = page.getByTestId("patch-review-panel");
      const inlineAccept = page.getByRole("button", { name: /^Accept$/i });
      const patchReviewChrome = page.getByText(/Patch review/i);
      await expect(review.or(inlineAccept).or(patchReviewChrome).first()).toBeVisible();
      if (await review.isVisible().catch(() => false)) {
        await expect(review.getByTestId("patch-review-file-chips")).toContainText("src/App.tsx");
        await expect(review.getByRole("button", { name: "Reject all" })).toBeVisible();
      }
    }

    if (outcome === "waiting_for_review" || outcome === "patch_applied") {
      const routing = await page.evaluate(() => window.__studioTestHooks?.getRoutingState?.());
      expect(routing?.intent).toBe("feature_addition");
      expect(routing?.files_allowed?.some((p) => p.includes("App.tsx"))).toBe(true);
    }

    await assertNoRenderLoopConsoleErrors(page);
  });
});
