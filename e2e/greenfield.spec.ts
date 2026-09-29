import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
  closeStudioApp,
  getMainWindow,
  launchStudioApp,
  openFixtureProject,
  dismissBlockingDialogs,
  fillAgentPrompt,
  sendAgentPrompt,
  waitForComposerReady,
  waitForGreenfieldRunTerminal,
} from "./helpers/studio";

let app: ElectronApplication | undefined;
let page: Page;
let projectDir = "";

test.describe("Greenfield create (mock provider)", () => {
  test.beforeAll(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-greenfield-"));
    await fs.writeFile(path.join(projectDir, ".gitkeep"), "\n");
    app = await launchStudioApp({ e2eProject: null });
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openFixtureProject(page, projectDir);
    await waitForComposerReady(page);
  });

  test.afterAll(async () => {
    await closeStudioApp(app);
    if (projectDir) {
      await fs.rm(projectDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  test("mock greenfield completes without typecheck script failure", async () => {
    test.setTimeout(180_000);

    const prompt = "Build a simple calculator app";
    await fillAgentPrompt(page, prompt);
    await expect(page.locator("#build-prompt")).toHaveValue(prompt);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);

    const outcome = await waitForGreenfieldRunTerminal(page, { acceptReview: true });
    expect(outcome).toBe("success");

    const failureReason = await page.evaluate(
      () =>
        window.__studioTestHooks?.getReadinessState?.()?.greenfieldRun.lastFailureReason ??
        null,
    );
    expect(failureReason?.toLowerCase().includes("typecheck")).toBeFalsy();
  });
});
