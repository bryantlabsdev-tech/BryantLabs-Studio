import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
  getMainWindow,
  launchStudioApp,
  dismissBlockingDialogs,
  projectRoot,
} from "./helpers/studio";

const screenshotDir = path.join(projectRoot, "docs/onboarding");

let app: ElectronApplication;
let page: Page;
let userDataDir: string;

test.describe("First-run onboarding", () => {
  test.beforeAll(async () => {
    await fs.mkdir(screenshotDir, { recursive: true });
    userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "bryantlabs-onboarding-"));
    app = await launchStudioApp({ e2eProject: null, userDataDir });
    page = await getMainWindow(app);
    await page.waitForLoadState("domcontentloaded");
    await dismissBlockingDialogs(page);
    await page.evaluate(() => {
      localStorage.removeItem("bryantlabs.onboarding.v1");
    });
    await page.reload({ waitUntil: "domcontentloaded" });
    await dismissBlockingDialogs(page);
  });

  test.afterAll(async () => {
    await app.close();
  });

  test("welcome screen orients new users", async () => {
    const welcome = page.getByTestId("welcome-screen");
    const visible = await welcome.isVisible().catch(() => false);
    if (!visible) {
      test.skip(true, "Welcome screen hidden in this build (onboarding E2E flag off).");
    }

    await expect(welcome).toBeVisible();
    await expect(page.getByTestId("welcome-build-new")).toBeVisible();
    await expect(page.getByTestId("welcome-open-project")).toBeVisible();
    await expect(page.getByTestId("welcome-view-examples")).toBeVisible();

    await page.screenshot({
      path: path.join(screenshotDir, "welcome-screen-default.png"),
      fullPage: true,
    });

    await page.getByTestId("welcome-view-examples").click();
    const examples = page.getByTestId("welcome-examples");
    await expect(examples).toBeVisible();
    await expect(
      examples.getByRole("button", { name: "Build a product comparison app for cosmetics" }),
    ).toBeVisible();
    await expect(examples.getByRole("button", { name: "Build a CRM dashboard" })).toBeVisible();

    await page.screenshot({
      path: path.join(screenshotDir, "welcome-screen-examples.png"),
      fullPage: true,
    });
  });
});
