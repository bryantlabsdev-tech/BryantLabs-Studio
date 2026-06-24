import path from "node:path";
import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
  dismissBlockingDialogs,
  getMainWindow,
  launchStudioApp,
  openFixtureProject,
  waitForComposerReady,
  waitForPatchReviewReady,
  waitForPreviewPanelUrl,
} from "./helpers/studio";

type ComputedOverlayStyles = {
  backdropAlpha: number;
  modalAlpha: number;
  panelAlpha: number;
  timelineAlpha: number;
  workbenchContentBehind: boolean;
};

async function readRunInspectorOverlayStyles(page: Page): Promise<ComputedOverlayStyles> {
  return page.evaluate(() => {
    const backdrop = document.querySelector(".diagnostic-modal__backdrop");
    const modal = document.querySelector('[data-testid="run-inspector-modal"]');
    const panel = document.querySelector('[data-testid="run-inspector-panel"]');
    const timeline = document.querySelector(".run-inspector__timeline-item");
    const workbenchContent = document.querySelector(
      '.center-diff, [data-testid="preview-panel-url"], .center-preview',
    );

    const alpha = (el: Element | null) => {
      if (!el) return 0;
      const style = getComputedStyle(el);
      const bg = style.backgroundColor;
      if (!bg || bg === "transparent") return 0;
      const match = bg.match(/rgba?\(([^)]+)\)/);
      if (!match) return 1;
      const parts = match[1].split(",").map((part) => part.trim());
      if (parts.length === 4) return Number.parseFloat(parts[3] ?? "1");
      return 1;
    };

    return {
      backdropAlpha: alpha(backdrop),
      modalAlpha: alpha(modal),
      panelAlpha: alpha(panel),
      timelineAlpha: alpha(timeline),
      workbenchContentBehind: Boolean(
        workbenchContent && getComputedStyle(workbenchContent).visibility !== "hidden",
      ),
    };
  });
}

let app: ElectronApplication;
let page: Page;

test.describe("Run Inspector overlay opacity", () => {
  test.beforeAll(async () => {
    app = await launchStudioApp();
    page = await getMainWindow(app);
    await page.waitForLoadState("domcontentloaded");
    await dismissBlockingDialogs(page);
    await openFixtureProject(page);
    await waitForComposerReady(page);
  });

  test.afterAll(async () => {
    await app.close();
  });

  test.beforeEach(async () => {
    await dismissBlockingDialogs(page);
  });

  test("preview does not bleed through opaque Run Inspector panels", async () => {
    const previewReady = await page.evaluate(() => {
      return window.__studioTestHooks?.simulatePreviewReady?.({
        url: "http://127.0.0.1:4173/",
        port: 4173,
      });
    });
    expect(previewReady?.ok).toBe(true);
    await page.getByRole("region", { name: "Workbench" }).getByRole("tab", { name: "Preview" }).click();
    await waitForPreviewPanelUrl(page, 4173);

    const simulated = await page.evaluate(() => {
      return window.__studioTestHooks?.simulatePatchReadyForReview?.();
    });
    expect(simulated?.ok).toBe(true);
    await waitForPatchReviewReady(page);

    await page.getByTestId("run-inspector-open").click();
    await expect(page.getByTestId("run-inspector-modal")).toBeVisible();
    await expect(page.getByTestId("run-inspector-panel")).toBeVisible();

    const styles = await readRunInspectorOverlayStyles(page);
    expect(styles.workbenchContentBehind).toBe(true);
    expect(styles.backdropAlpha).toBeGreaterThanOrEqual(0.9);
    expect(styles.modalAlpha).toBeGreaterThanOrEqual(0.99);
    expect(styles.panelAlpha).toBeGreaterThanOrEqual(0.99);
    if (styles.timelineAlpha > 0) {
      expect(styles.timelineAlpha).toBeGreaterThanOrEqual(0.99);
    }

    const screenshotPath = path.join(
      "e2e",
      "test-results",
      "run-inspector-opacity-after.png",
    );
    await page.screenshot({ path: screenshotPath, fullPage: true });
  });
});
