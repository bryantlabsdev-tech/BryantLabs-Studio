import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
  closeStudioApp,
  dismissBlockingDialogs,
  getMainWindow,
  launchStudioApp,
  openFixtureProject,
  sudokuFixturePath,
  waitForComposerReady,
  waitForPatchReviewReady,
  assertNoRenderLoopConsoleErrors,
} from "./helpers/studio";

const HISTORY_REL = "src/components/History.tsx";
const APP_REL = "src/App.tsx";
const UNDO_MARKER = "MOCK_BATCH_UNDO";

async function copySudokuWorkspace(): Promise<string> {
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), "bl-undo-e2e-"));
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

test.describe("Batch-aware undo (mock provider)", () => {
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

  test("review-first Accept all and auto-apply undo mixed create/edit", async () => {
    const simulated = await page.evaluate(() =>
      window.__studioTestHooks?.simulateMixedCreateEditReadyForReview?.(),
    );
    expect(simulated?.ok).toBe(true);
    await waitForPatchReviewReady(page);

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
      expect(fallback?.ok).toBe(true);
    }
    await waitForAppliedFiles(projectDir);

    await undoViaAdvanced(page);
    await expectRestored(projectDir, originalApp);

    const autoSim = await page.evaluate(() =>
      window.__studioTestHooks?.simulateMixedCreateEditReadyForReview?.(),
    );
    expect(autoSim?.ok).toBe(true);
    await waitForPatchReviewReady(page);
    const autoApply = await page.evaluate(() =>
      window.__studioTestHooks?.applyApprovedReadyFiles?.(),
    );
    expect(autoApply && "ok" in autoApply).toBeTruthy();
    await waitForAppliedFiles(projectDir);

    const canUndo = await page.evaluate(() =>
      window.__studioTestHooks?.getCanUndo?.() ?? false,
    );
    expect(canUndo).toBe(true);
    const undoLast = page.getByRole("button", { name: "Undo Last Edit" });
    if (await undoLast.isEnabled().catch(() => false)) {
      await undoLast.click();
    } else {
      await page.evaluate(() => window.__studioTestHooks?.undoLastEdit?.());
    }
    await expectRestored(projectDir, originalApp);
  });

  test("restart leaves undo unavailable", async () => {
    const simulated = await page.evaluate(() =>
      window.__studioTestHooks?.simulateMixedCreateEditReadyForReview?.(),
    );
    expect(simulated?.ok).toBe(true);
    await waitForPatchReviewReady(page);
    const applied = await page.evaluate(() =>
      window.__studioTestHooks?.applyApprovedReadyFiles?.(),
    );
    expect(applied && "ok" in applied).toBeTruthy();
    await waitForAppliedFiles(projectDir);

    await closeStudioApp(app);
    app = await launchStudioApp({ e2eProject: null });
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openFixtureProject(page, projectDir);
    await waitForComposerReady(page);

    const canUndo = await page.evaluate(() =>
      window.__studioTestHooks?.getCanUndo?.() ?? false,
    );
    expect(canUndo).toBe(false);
    await page.getByRole("button", { name: "More", exact: true }).click();
    await expect(page.getByRole("button", { name: "Undo last change" })).toHaveCount(0);

    const nothing = await page.evaluate(async () => {
      await window.__studioTestHooks?.undoLastEdit?.();
      return window.__studioTestHooks?.getCanUndo?.() ?? false;
    });
    expect(nothing).toBe(false);
    expect(await pathExists(path.join(projectDir, HISTORY_REL))).toBe(true);
  });
});
