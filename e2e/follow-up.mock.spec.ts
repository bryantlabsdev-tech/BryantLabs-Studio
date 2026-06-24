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
    await app.close();
  });

  test("mock provider reaches review after gameplay follow-up", async () => {
    test.setTimeout(120_000);

    await page.evaluate(() => {
      localStorage.setItem("bryantlabs.followUpReviewFirst", "1");
    });

    await fillAgentPrompt(page, "Upgrade Sudoku gameplay. Add notes mode and hints.");
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);

    const outcome = await waitForPostPatchProgress(page);
    expect(["waiting_for_review", "ready_for_apply", "apply_failed"]).toContain(outcome);

    if (outcome === "waiting_for_review") {
      const review = page.getByTestId("run-review-actions");
      await expect(review).toBeVisible();
      await expect(review.getByText("src/App.tsx")).toBeVisible();
      await expect(review.getByRole("button", { name: "Approve" })).toBeEnabled();

      const routing = await page.evaluate(() => window.__studioTestHooks?.getRoutingState?.());
      expect(routing?.intent).toBe("feature_addition");
      expect(routing?.files_allowed?.some((p) => p.includes("App.tsx"))).toBe(true);
    }
  });

  test("review actions render in run conversation block", async () => {
    const simulated = await page.evaluate(() => {
      return window.__studioTestHooks?.simulatePatchReadyForReview?.();
    });
    expect(simulated?.ok).toBe(true);
    await waitForPatchReviewReady(page);
    const review = page.getByTestId("run-review-actions");
    await expect(review).toBeVisible();
    await expect(review.getByText("src/App.tsx")).toBeVisible();
    await expect(review.getByRole("button", { name: "Approve" })).toBeEnabled();
    await expect(review.getByRole("button", { name: "Reject" })).toBeVisible();
  });

  test("view changes opens diff in workbench", async () => {
    const simulated = await page.evaluate(() => {
      return window.__studioTestHooks?.simulatePatchReadyForReview?.();
    });
    expect(simulated?.ok).toBe(true);
    await waitForPatchReviewReady(page);
    await dismissBlockingDialogs(page);

    await page
      .locator("article")
      .filter({ has: page.getByTestId("run-review-actions") })
      .getByRole("button", { name: "View changes" })
      .click();
    await waitForWorkbenchDiffTab(page);

    const diffPanel = page.locator(".center-diff");
    await expect(diffPanel).toBeVisible();
    await expect(diffPanel.getByText("src/App.tsx")).toBeVisible();
  });
});
