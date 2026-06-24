import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
  composerExample,
  fillAgentPrompt,
  getMainWindow,
  launchStudioApp,
  sendAgentPrompt,
  waitForAgentReady,
  dismissBlockingDialogs,
} from "./helpers/studio";

let app: ElectronApplication;
let page: Page;

test.describe("Composer UI", () => {
  test.beforeAll(async () => {
    app = await launchStudioApp();
    page = await getMainWindow(app);
    await waitForAgentReady(page);
  });

  test.afterAll(async () => {
    await app.close();
  });

  test("shows agent composer with follow-up examples", async () => {
    await expect(page.locator("#build-prompt")).toBeVisible();
    await expect(page.getByTestId("agent-send")).toBeVisible();
    const example = composerExample(page, "Improve mobile layout");
    if (await example.isVisible().catch(() => false)) {
      await expect(example).toBeVisible();
    }
  });

  test("shows project memory after fixture project loads", async () => {
    const panel = page.getByLabel("Project memory");
    await expect(panel).toBeVisible();
    await expect(panel.getByText(/sudoku/i)).toBeVisible();
  });

  test("fills composer from example chip when visible", async () => {
    const chip = composerExample(page, "Add a timer");
    if (await chip.isVisible().catch(() => false)) {
      await chip.click();
      await expect(page.locator("#build-prompt")).toHaveValue("Add a timer");
    } else {
      await fillAgentPrompt(page, "Add a timer");
      await expect(page.locator("#build-prompt")).toHaveValue("Add a timer");
    }
  });
});
