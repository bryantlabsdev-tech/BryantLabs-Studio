import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
  dismissBlockingDialogs,
  fillAgentPrompt,
  getMainWindow,
  launchStudioApp,
  waitForAgentReady,
} from "./helpers/studio";

test.describe("FieldFlow greenfield (mock provider)", () => {
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

  test("accepts FieldFlow multi-page prompt in agent composer", async () => {
    const prompt =
      "Build FieldFlow — a multi-page SaaS dashboard with leads, jobs, estimates, invoices, customers, and settings pages using React Router.";
    await fillAgentPrompt(page, prompt);
    await expect(page.locator("#build-prompt")).toHaveValue(prompt);
    await dismissBlockingDialogs(page);
  });
});
