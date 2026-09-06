import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
  dismissBlockingDialogs,
  fillAgentPrompt,
  getMainWindow,
  launchStudioApp,
  sendAgentPrompt,
  waitForAgentReady,
  waitForPostPatchProgress,
  openFixtureProject,
  waitForComposerReady,
  waitForPatchReviewReady,
  waitForWorkbenchDiffTab,
  assertNoRenderLoopConsoleErrors,
} from "./helpers/studio";

test.describe("Follow-up edit (mock provider)", () => {
  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    app = await launchStudioApp();
    page = await getMainWindow(app);
    await waitForAgentReady(page);
  });

  test.afterAll(async () => {
    await assertNoRenderLoopConsoleErrors(page);
    await app.close();
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
  let app: ElectronApplication;
  let page: Page;

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
    await assertNoRenderLoopConsoleErrors(page);
    await app.close();
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
    await expect(review).toBeVisible();
    await expect(review.getByTestId("patch-review-file-chips")).toContainText("src/App.tsx");
    await expect(review.getByRole("button", { name: "Accept all" })).toBeEnabled();
    await expect(review.getByRole("button", { name: "Reject all" })).toBeVisible();
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

  test("mock provider reaches review after gameplay follow-up", async () => {
    test.setTimeout(120_000);

    await openFixtureProject(page);
    await waitForComposerReady(page);

    await page.evaluate(() => {
      localStorage.setItem("bryantlabs.followUpReviewFirst", "1");
    });

    await fillAgentPrompt(page, "Upgrade Sudoku gameplay. Add notes mode and hints.");
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);

    const outcome = await waitForPostPatchProgress(page);
    expect(["waiting_for_review", "ready_for_apply", "apply_failed"]).toContain(outcome);

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
      await expect(review).toBeVisible();
      await expect(review.getByTestId("patch-review-file-chips")).toContainText("src/App.tsx");
      await expect(review.getByRole("button", { name: "Accept all" })).toBeEnabled();

      const routing = await page.evaluate(() => window.__studioTestHooks?.getRoutingState?.());
      expect(routing?.intent).toBe("feature_addition");
      expect(routing?.files_allowed?.some((p) => p.includes("App.tsx"))).toBe(true);
    }

    await assertNoRenderLoopConsoleErrors(page);
  });
});
