import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
  emptyProjectFixturePath,
  getMainWindow,
  launchStudioApp,
  openFixtureProject,
  dismissBlockingDialogs,
  fillAgentPrompt,
  sendAgentPrompt,
  waitForComposerReady,
  waitForGreenfieldRunTerminal,
  resetEmptyProjectFixture,
} from "./helpers/studio";

let app: ElectronApplication;
let page: Page;

test.describe("Greenfield create (mock provider)", () => {
  test.beforeAll(async () => {
    await resetEmptyProjectFixture();
    app = await launchStudioApp({ e2eProject: null });
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openFixtureProject(page, emptyProjectFixturePath);
    await waitForComposerReady(page);
  });

  test.afterAll(async () => {
    await app.close();
  });

  test("mock greenfield completes without typecheck script failure", async () => {
    test.setTimeout(180_000);

    const prompt = "Build a simple calculator app";
    await fillAgentPrompt(page, prompt);
    await expect(page.locator("#build-prompt")).toHaveValue(prompt);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);

    const outcome = await waitForGreenfieldRunTerminal(page);
    expect(outcome).toBe("success");

    const failureReason = await page.evaluate(
      () =>
        window.__studioTestHooks?.getReadinessState?.()?.greenfieldRun.lastFailureReason ??
        null,
    );
    expect(failureReason?.toLowerCase().includes("typecheck")).toBeFalsy();
  });
});
