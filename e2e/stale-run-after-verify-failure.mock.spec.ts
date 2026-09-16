import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
  closeStudioApp,
  dismissBlockingDialogs,
  fillAgentPrompt,
  getMainWindow,
  launchStudioApp,
  openFixtureProject,
  sendAgentPrompt,
  sudokuFixturePath,
  waitForComposerReady,
  waitForPatchReviewReady,
  assertNoRenderLoopConsoleErrors,
} from "./helpers/studio";

const HISTORY_REL = "src/components/History.tsx";
const APP_REL = "src/App.tsx";
const UNDO_MARKER = "MOCK_BATCH_UNDO";
const FOLLOW_UP_PROMPT = "Add a timer";

async function copySudokuWorkspace(): Promise<string> {
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), "bl-stale-run-e2e-"));
  await fs.cp(sudokuFixturePath, dest, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}node_modules`) && !src.includes(".bryantlabs"),
  });
  return dest;
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function waitForAppliedFiles(projectDir: string): Promise<void> {
  const history = path.join(projectDir, HISTORY_REL);
  const appFile = path.join(projectDir, APP_REL);
  await expect
    .poll(async () => {
      const created = await pathExists(history);
      const app = await fs.readFile(appFile, "utf8").catch(() => "");
      return created && app.includes(UNDO_MARKER);
    }, { timeout: 30_000 })
    .toBe(true);
}

async function undoViaAdvanced(page: Page): Promise<void> {
  const undo = page.getByRole("button", { name: "Undo last change" });
  if (!(await undo.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "More", exact: true }).click();
  }
  await expect(undo).toBeVisible();
  await undo.click();
}

async function expectRestored(projectDir: string, originalApp: string): Promise<void> {
  await expect
    .poll(async () => {
      const created = await pathExists(path.join(projectDir, HISTORY_REL));
      const app = await fs.readFile(path.join(projectDir, APP_REL), "utf8").catch(() => "");
      return { created, app };
    }, { timeout: 30_000 })
    .toEqual({ created: false, app: originalApp });
}

async function acceptSimulatedReview(page: Page, projectDir: string): Promise<void> {
  const simulated = await page.evaluate(() =>
    window.__studioTestHooks?.simulateMixedCreateEditReadyForReview?.(),
  );
  expect(simulated?.ok).toBe(true);
  await waitForPatchReviewReady(page);
  await page.evaluate(() =>
    window.__studioTestHooks?.forceNextVerificationFailure?.(
      "Forced verification failure",
    ),
  );
  const reviewChip = page.getByTestId("agent-review-chip");
  if (await reviewChip.isVisible().catch(() => false)) {
    await reviewChip.getByRole("button", { name: /Review changes/i }).click();
  }
  const acceptAll = page.getByRole("button", { name: "Accept all" });
  if (await acceptAll.first().isVisible().catch(() => false)) {
    await acceptAll.first().click();
  } else {
    const fallback = await page.evaluate(() =>
      window.__studioTestHooks?.applyApprovedReadyFiles?.(),
    );
    expect(fallback?.ok).toBe(false);
  }
  await waitForAppliedFiles(projectDir);
}

test.describe("Stale-run recovery after verification failure (mock)", () => {
  let app: ElectronApplication | undefined;
  let page: Page | undefined;
  let projectDir: string;
  let originalApp: string;

  test.beforeAll(async () => {
    projectDir = await copySudokuWorkspace();
    originalApp = await fs.readFile(path.join(projectDir, APP_REL), "utf8");
    app = await launchStudioApp({ e2eProject: null });
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openFixtureProject(page, projectDir);
    await waitForComposerReady(page);
  });

  test.afterAll(async () => {
    try {
      if (page) await assertNoRenderLoopConsoleErrors(page);
    } finally {
      await closeStudioApp(app);
      if (projectDir) {
        await fs.rm(projectDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  });

  test("successful undo after verify failure allows the next prompt without Reset", async () => {
    test.setTimeout(180_000);
    await acceptSimulatedReview(page, projectDir);

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const pipeline = window.__studioTestHooks?.getPatchPipelineState?.();
          const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
          return {
            planApplyError: pipeline?.planApplyError ?? null,
            phase: pipeline?.planApplyPhase ?? null,
            acceptAll: document.querySelectorAll("button").length,
            failure: run?.failureReport?.rootCauseLine ?? run?.finalMessage ?? null,
          };
        });
      }, { timeout: 30_000 })
      .toMatchObject({
        phase: null,
      });

    const failureVisible = await page.evaluate(() => {
      const pipeline = window.__studioTestHooks?.getPatchPipelineState?.();
      const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
      return Boolean(
        pipeline?.planApplyError ||
          run?.failureReport?.rootCauseLine ||
          run?.entries?.some((entry) => entry.status === "failed"),
      );
    });
    expect(failureVisible).toBe(true);
    await expect(page.getByRole("button", { name: "Accept all" })).toHaveCount(0);

    await undoViaAdvanced(page);
    await expectRestored(projectDir, originalApp);

    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const pipeline = window.__studioTestHooks?.getPatchPipelineState?.();
          return pipeline?.planApplyError ?? null;
        });
      })
      .toBeNull();

    await waitForComposerReady(page);
    await fillAgentPrompt(page, FOLLOW_UP_PROMPT);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);
    const stale = page.getByRole("region", { name: "Stale run state" });
    await expect(stale).toBeHidden();
    const proceed = page.getByRole("button", { name: /^Proceed anyway$/i });
    if (await proceed.isVisible().catch(() => false)) {
      await proceed.click();
    }
    await expect(page.getByRole("button", { name: /^Reset and start$/i })).toHaveCount(0);

    await page.waitForFunction(
      () =>
        window.__studioTestHooks?.getPatchPipelineState?.()?.planApplyPhase ===
        "waiting_for_review",
      undefined,
      { timeout: 90_000 },
    );
    await expect(page.getByRole("button", { name: "Accept all" })).toHaveCount(1);
  });

  test("partial undo keeps stale-run protection and reports the failed path", async () => {
    test.setTimeout(180_000);
    await page.evaluate(() => window.__studioTestHooks?.clearFollowUpReviewFirstPreference?.());
    await acceptSimulatedReview(page, projectDir);
    await page.evaluate(() =>
      window.__studioTestHooks?.forceNextUndoPathFailure?.("src/components/History.tsx"),
    );
    await undoViaAdvanced(page);

    await expect
      .poll(async () => pathExists(path.join(projectDir, HISTORY_REL)), {
        timeout: 30_000,
      })
      .toBe(true);
    await expect
      .poll(async () => {
        const app = await fs.readFile(path.join(projectDir, APP_REL), "utf8").catch(() => "");
        return app.includes(UNDO_MARKER);
      }, { timeout: 30_000 })
      .toBe(true);

    const undoError = await page.evaluate(() => {
      const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
      return (
        run?.entries
          ?.filter((entry) => entry.status === "failed")
          .map((entry) => `${entry.message} ${entry.details ?? ""}`)
          .join("\n") ?? ""
      );
    });
    expect(undoError).toMatch(/History\.tsx/i);

    const canUndoAfterPartial = await page.evaluate(
      () => window.__studioTestHooks?.getCanUndo?.() ?? false,
    );
    expect(canUndoAfterPartial).toBe(true);

    await waitForComposerReady(page);
    await fillAgentPrompt(page, FOLLOW_UP_PROMPT);
    await sendAgentPrompt(page);
    await expect(page.getByRole("region", { name: "Stale run state" })).toBeVisible();
    await page.getByRole("button", { name: /^Cancel$/i }).click();

    await undoViaAdvanced(page);
    await expectRestored(projectDir, originalApp);
    await expect
      .poll(async () =>
        page.evaluate(() => window.__studioTestHooks?.getCanUndo?.() ?? true),
      )
      .toBe(false);

    await waitForComposerReady(page);
    await fillAgentPrompt(page, FOLLOW_UP_PROMPT);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);
    await expect(page.getByRole("region", { name: "Stale run state" })).toBeHidden();
    await expect(page.getByRole("button", { name: /^Reset and start$/i })).toHaveCount(0);
    await page.waitForFunction(
      () =>
        window.__studioTestHooks?.getPatchPipelineState?.()?.planApplyPhase ===
        "waiting_for_review",
      undefined,
      { timeout: 90_000 },
    );
  });
});
