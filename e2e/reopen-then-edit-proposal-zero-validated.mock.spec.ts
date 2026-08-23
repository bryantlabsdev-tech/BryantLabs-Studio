import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
  dismissBlockingDialogs,
  emptyProjectFixturePath,
  fillAgentPrompt,
  getMainWindow,
  launchStudioApp,
  openExistingProjectAt,
  readIndexStatusLabel,
  readReadyIndexedFileCount,
  sendAgentPrompt,
  waitForComposerReady,
  waitForPatchApplied,
} from "./helpers/studio";

test.describe("Reopen lifecycle: Apply Plan should generate proposals", () => {
  let app: ElectronApplication;
  let page: Page;

  const editPrompt = "Add priority levels and due dates to tasks.";

  test.setTimeout(360_000);

  test.beforeAll(async () => {
    // Keep a stable task-manager scaffold for priority/due-date edits.
    // Do not wipe the fixture — create-then-edit.mock owns empty-folder greenfield.
    app = await launchStudioApp({ e2eProject: null });
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);

    await openExistingProjectAt(page, emptyProjectFixturePath);
    await waitForComposerReady(page);
    await page.locator("#build-prompt").waitFor({ state: "visible", timeout: 30_000 });
  });

  test.afterAll(async () => {
    await app.close();
  });

  test("create + edit, quit, reopen, edit again (no zero-proposals failure)", async () => {
    // Ensure follow-up edits auto-apply (no manual patch review needed).
    await page.evaluate(() => {
      localStorage.setItem("bryantlabs.followUpReviewFirst", "0");
    });

    const readiness = await page.evaluate(() => window.__studioTestHooks?.getReadinessState?.());
    // eslint-disable-next-line no-console
    console.log("[repro:pre_create] projectPath=", readiness?.projectPath, "scanStatus=", readiness?.scanStatus);
    expect(String(readiness?.projectPath ?? "")).toMatch(/empty-project|fixtures/);

    // Successful edit before quitting.
    await fillAgentPrompt(page, editPrompt);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);

    const beforeQuitOutcome = await waitForPatchApplied(page);
    const beforeQuitRun = await page.evaluate(() => window.__studioTestHooks?.getGreenfieldRunSnapshot?.());

    // Console logs are useful when diagnosing rare lifecycle ordering bugs.
    // eslint-disable-next-line no-console
    console.log("[repro:before_quit] outcome=", beforeQuitOutcome, "failureRoot=", beforeQuitRun?.failureReport?.rootCauseLine);

    expect(beforeQuitOutcome).toBe("patch_applied");
    expect(String(beforeQuitRun?.failureReport?.rootCauseLine ?? "")).not.toMatch(
      /zero valid patch proposals/i,
    );

    // Quit fully (process exit) and reopen Studio.
    await app.close();

    app = await launchStudioApp({ e2eProject: null });
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);

    await openExistingProjectAt(page, emptyProjectFixturePath);
    await waitForComposerReady(page);

    const reopenedIndexLabel = await readIndexStatusLabel(page);
    const reopenedIndexedFiles = await readReadyIndexedFileCount(page);
    const reopenedReadiness = await page.evaluate(() => window.__studioTestHooks?.getReadinessState?.());

    // eslint-disable-next-line no-console
    console.log("[repro:after_reopen] scanStatus=", reopenedReadiness?.scanStatus, "indexLabel=", reopenedIndexLabel, "indexedFiles=", reopenedIndexedFiles);

    // Edit again after reopen.
    await page.evaluate(() => {
      localStorage.setItem("bryantlabs.followUpReviewFirst", "0");
    });

    await fillAgentPrompt(page, editPrompt);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);

    const afterReopenOutcome = await waitForPatchApplied(page);
    const afterReopenRun = await page.evaluate(() => window.__studioTestHooks?.getGreenfieldRunSnapshot?.());

    // eslint-disable-next-line no-console
    console.log(
      "[repro:after_reopen] outcome=",
      afterReopenOutcome,
      "failureRoot=",
      afterReopenRun?.failureReport?.rootCauseLine,
      "failureDetail=",
      afterReopenRun?.failureReport?.stages?.[0]?.detail,
    );

    expect(afterReopenOutcome).toBe("patch_applied");
    expect(String(afterReopenRun?.failureReport?.rootCauseLine ?? "")).not.toMatch(
      /zero valid patch proposals/i,
    );

    // Second quit/reopen cycle.
    await app.close();
    app = await launchStudioApp({ e2eProject: null });
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openExistingProjectAt(page, emptyProjectFixturePath);
    await waitForComposerReady(page);

    await page.evaluate(() => {
      localStorage.setItem("bryantlabs.followUpReviewFirst", "0");
    });

    const secondEditPrompt = "Make the task list easier to scan visually.";
    await fillAgentPrompt(page, secondEditPrompt);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);

    const secondReopenOutcome = await waitForPatchApplied(page);
    const secondReopenRun = await page.evaluate(() => window.__studioTestHooks?.getGreenfieldRunSnapshot?.());

    // eslint-disable-next-line no-console
    console.log(
      "[repro:second_reopen] outcome=",
      secondReopenOutcome,
      "failureRoot=",
      secondReopenRun?.failureReport?.rootCauseLine,
    );

    expect(secondReopenOutcome).toBe("patch_applied");
    expect(String(secondReopenRun?.failureReport?.rootCauseLine ?? "")).not.toMatch(
      /zero valid patch proposals/i,
    );
  });
});

