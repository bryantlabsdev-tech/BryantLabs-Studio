import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
  getMainWindow,
  launchStudioApp,
  waitForAgentReady,
  waitForPreviewPanelUrl,
} from "./helpers/studio";

let app: ElectronApplication;
let page: Page;

test.describe("Preview verification", () => {
  test.beforeAll(async () => {
    app = await launchStudioApp();
    page = await getMainWindow(app);
    await waitForAgentReady(page);
  });

  test.afterAll(async () => {
    await app.close();
  });

  test("preview panel shows running URL from test hook", async () => {
    const simulated = await page.evaluate(() => {
      return window.__studioTestHooks?.simulatePreviewReady?.({
        url: "http://127.0.0.1:4173/",
        port: 4173,
      });
    });
    expect(simulated?.ok).toBe(true);

    await waitForPreviewPanelUrl(page, 4173);
    await expect(page.getByTestId("preview-panel-url")).toContainText("4173");
  });
});
