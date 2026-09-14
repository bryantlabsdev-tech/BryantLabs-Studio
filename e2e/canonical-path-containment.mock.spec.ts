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

const APP_REL = "src/App.tsx";
const OUTSIDE_MESSAGE = "Path is outside the project root.";

async function copySudokuWithSrcLinkedOutside(): Promise<{
  projectDir: string;
  outsideDir: string;
  sentinel: string;
  originalApp: string;
}> {
  const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-contain-e2e-"));
  const outsideDir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-contain-e2e-out-"));
  await fs.cp(sudokuFixturePath, projectDir, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}node_modules`) && !src.includes(".bryantlabs"),
  });
  const originalApp = await fs.readFile(path.join(projectDir, APP_REL), "utf8");
  await fs.rename(path.join(projectDir, "src"), path.join(outsideDir, "src"));
  await fs.symlink(path.join(outsideDir, "src"), path.join(projectDir, "src"));
  const sentinel = path.join(outsideDir, "SENTINEL.txt");
  await fs.writeFile(sentinel, "untouched\n", "utf8");
  return { projectDir, outsideDir, sentinel, originalApp };
}

test.describe("Canonical path containment (mock provider)", () => {
  let app: ElectronApplication | undefined;
  let page: Page | undefined;
  let projectDir: string;
  let outsideDir: string;
  let sentinel: string;
  let originalApp: string;

  test.beforeAll(async () => {
    const fixture = await copySudokuWithSrcLinkedOutside();
    projectDir = fixture.projectDir;
    outsideDir = fixture.outsideDir;
    sentinel = fixture.sentinel;
    originalApp = fixture.originalApp;
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
      if (outsideDir) {
        await fs.rm(outsideDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  });

  test("Apply Plan for src/App.tsx through an outside src link is rejected", async () => {
    const simulated = await page.evaluate(() =>
      window.__studioTestHooks?.simulateMixedCreateEditReadyForReview?.(),
    );
    expect(simulated?.ok).toBe(true);
    await waitForPatchReviewReady(page);

    const applied = await page.evaluate(() =>
      window.__studioTestHooks?.applyApprovedReadyFiles?.(),
    );
    expect(applied?.ok).toBe(false);

    const pipeline = await page.evaluate(
      () => window.__studioTestHooks?.getPatchPipelineState?.() ?? null,
    );
    expect(pipeline?.planApplyError ?? "").toContain(OUTSIDE_MESSAGE);

    const body = await page.locator("body").innerText();
    expect(body).toContain(OUTSIDE_MESSAGE);

    expect(await fs.readFile(sentinel, "utf8")).toBe("untouched\n");
    expect(await fs.readFile(path.join(outsideDir, APP_REL), "utf8")).toBe(originalApp);
  });
});
