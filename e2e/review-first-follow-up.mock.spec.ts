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
  waitForWorkbenchDiffTab,
  assertNoRenderLoopConsoleErrors,
} from "./helpers/studio";

const HISTORY_REL = "src/components/History.tsx";
const APP_REL = "src/App.tsx";
const MIXED_PROMPT =
  "Add calculation history. Show last 10 calculations. Create a separate History component. Add a clear history button.";
const TIMER_PROMPT = "Add a timer";

async function copySudokuWorkspace(): Promise<string> {
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), "bl-review-first-e2e-"));
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

async function readApp(projectDir: string): Promise<string> {
  return fs.readFile(path.join(projectDir, APP_REL), "utf8");
}

async function expectUnchangedDisk(projectDir: string, originalApp: string): Promise<void> {
  expect(await pathExists(path.join(projectDir, HISTORY_REL))).toBe(false);
  expect(await readApp(projectDir)).toBe(originalApp);
}

async function previewOrBuildStarted(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const ready = window.__studioTestHooks?.getReadinessState?.();
    const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
    const previewStarted = Boolean(ready?.previewPanel?.running || ready?.previewPanel?.url);
    const logsStarted = Boolean(
      run?.entries?.some(
        (entry) =>
          (entry.stage === "preview" || entry.stage === "verification") &&
          entry.status === "running",
      ),
    );
    return previewStarted || logsStarted;
  });
}

async function resetForNewPrompt(page: Page): Promise<void> {
  await dismissBlockingDialogs(page);
  const failedReset = page.getByRole("button", { name: /^Reset$/ });
  if (await failedReset.first().isVisible().catch(() => false)) {
    await failedReset.first().click();
  }
  const more = page.getByRole("button", { name: "More", exact: true });
  if (await more.isVisible().catch(() => false)) {
    const expanded = await more.getAttribute("aria-expanded");
    if (expanded !== "true") await more.click();
  }
  const reset = page.getByRole("button", { name: /^Reset agent state$/i });
  if (await reset.isVisible().catch(() => false)) {
    await reset.click();
  }
  await dismissBlockingDialogs(page);
}

async function submitFollowUp(page: Page, prompt: string): Promise<void> {
  await waitForComposerReady(page);
  await resetForNewPrompt(page);
  await fillAgentPrompt(page, prompt);
  await sendAgentPrompt(page);
  await dismissBlockingDialogs(page);
  const proceed = page.getByRole("button", { name: /^Proceed anyway$/i });
  if (await proceed.isVisible().catch(() => false)) {
    await proceed.click();
  }
  const resetAndStart = page.getByRole("button", { name: /^Reset and start$/i });
  if (await resetAndStart.isVisible().catch(() => false)) {
    await resetAndStart.click();
  }
  await dismissBlockingDialogs(page);
}

async function waitForMixedProposal(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      window.__studioTestHooks?.getPatchPipelineState?.()?.planApplyPhase ===
      "waiting_for_review",
    undefined,
    { timeout: 90_000 },
  );
}

async function openDiffReview(page: Page): Promise<void> {
  const chip = page.getByTestId("agent-review-chip");
  await expect(chip.getByRole("button", { name: /Review changes/i })).toBeVisible();
  await expect(chip.getByRole("button", { name: "Accept all" })).toHaveCount(0);
  await expect(chip.getByRole("button", { name: "Reject all" })).toHaveCount(0);
  await chip.getByRole("button", { name: /Review changes/i }).click();
  await waitForWorkbenchDiffTab(page);
}

async function turnOffReviewFirst(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Command palette", exact: true }).first().click();
  const palette = page.getByTestId("command-palette");
  await expect(palette).toBeVisible();
  const input = palette.locator(".command-palette__input");
  await input.fill("review first");
  const off = palette.getByRole("option", { name: /Turn off review first/i });
  await expect(off).toBeVisible();
  await off.click();
  await expect(palette).toBeHidden();
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        const hooks = window.__studioTestHooks;
        return {
          stored: localStorage.getItem("bryantlabs.followUpReviewFirst"),
          reviewFirst: hooks?.getFollowUpReviewFirst?.() ?? null,
          autoContinue: hooks?.resolveFollowUpAutoContinue?.("Add a timer") ?? null,
        };
      });
    })
    .toEqual({ stored: "0", reviewFirst: false, autoContinue: true });
}

async function undoViaAdvanced(page: Page): Promise<void> {
  const undo = page.getByRole("button", { name: "Undo last change" });
  if (!(await undo.isVisible().catch(() => false))) {
    await page.getByRole("button", { name: "More", exact: true }).click();
  }
  await expect(undo).toBeVisible();
  await undo.click();
}

test.describe("Review-first follow-up (mock provider)", () => {
  let app: ElectronApplication | undefined;
  let page: Page | undefined;
  let projectDir: string;
  let originalApp: string;

  test.beforeAll(async () => {
    projectDir = await copySudokuWorkspace();
    originalApp = await readApp(projectDir);
    app = await launchStudioApp({ e2eProject: null });
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openFixtureProject(page, projectDir);
    await waitForComposerReady(page);
  });

  test.afterEach(async () => {
    await fs.writeFile(path.join(projectDir, APP_REL), originalApp);
    await fs.rm(path.join(projectDir, HISTORY_REL), { force: true }).catch(() => undefined);
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

  test("review-first mixed proposal, bulk actions, regenerate, and opt-out", async () => {
    test.setTimeout(240_000);

    await submitFollowUp(page, MIXED_PROMPT);
    await waitForMixedProposal(page);
    await expectUnchangedDisk(projectDir, originalApp);
    expect(await previewOrBuildStarted(page)).toBe(false);

    await openDiffReview(page);
    const workbench = page.getByRole("region", { name: "Workbench" });
    await expect(workbench.getByTestId("patch-review-file-chips")).toContainText("src/App.tsx");
    await expect(workbench.getByTestId("patch-review-file-chips")).toContainText(
      "src/components/History.tsx",
    );
    await expect(page.getByRole("button", { name: "Accept all" })).toHaveCount(1);
    await expect(workbench.getByRole("button", { name: "Reject all" })).toHaveCount(1);
    await expect(workbench.getByRole("button", { name: "Regenerate" })).toHaveCount(1);

    await workbench.getByRole("button", { name: "Regenerate" }).click();
    const resetAndStart = page.getByRole("button", { name: /^Reset and start$/i });
    if (await resetAndStart.isVisible().catch(() => false)) {
      await resetAndStart.click();
    }
    await page
      .waitForFunction(
        () =>
          window.__studioTestHooks?.getPatchPipelineState?.()?.planApplyPhase !==
          "waiting_for_review",
        undefined,
        { timeout: 15_000 },
      )
      .catch(() => undefined);
    await waitForMixedProposal(page);
    await expectUnchangedDisk(projectDir, originalApp);
    await openDiffReview(page);
    await expect(workbench.getByTestId("patch-review-file-chips")).toContainText("src/App.tsx");
    await expect(workbench.getByTestId("patch-review-file-chips")).toContainText(
      "src/components/History.tsx",
    );

    await workbench.getByRole("button", { name: "Reject all" }).click();
    await expectUnchangedDisk(projectDir, originalApp);
    await expect(page.getByTestId("agent-review-chip")).toBeHidden();
    await expect(page.locator("#build-prompt")).toBeEnabled();
    await fillAgentPrompt(page, "A later prompt");
    await expect(page.locator("#build-prompt")).toHaveValue("A later prompt");

    await submitFollowUp(page, MIXED_PROMPT);
    await waitForMixedProposal(page);
    await expectUnchangedDisk(projectDir, originalApp);
    expect(await previewOrBuildStarted(page)).toBe(false);
    await openDiffReview(page);
    await workbench.getByRole("button", { name: "Accept all" }).click();
    await expect
      .poll(async () => {
        const created = await pathExists(path.join(projectDir, HISTORY_REL));
        const appFile = await readApp(projectDir).catch(() => originalApp);
        return created && appFile !== originalApp;
      }, { timeout: 30_000 })
      .toBe(true);
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
          return Boolean(
            run?.entries?.some(
              (entry) => entry.stage === "verification" || entry.stage === "preview",
            ),
          );
        });
      }, { timeout: 30_000 })
      .toBe(true);

    await undoViaAdvanced(page);
    await expect
      .poll(async () => {
        const created = await pathExists(path.join(projectDir, HISTORY_REL));
        const appFile = await readApp(projectDir).catch(() => "");
        return { created, app: appFile };
      }, { timeout: 30_000 })
      .toEqual({ created: false, app: originalApp });

    await turnOffReviewFirst(page);
    await expect
      .poll(async () => {
        return page.evaluate(() => {
          const hooks = window.__studioTestHooks;
          return (
            hooks?.getFollowUpReviewFirst?.() === false &&
            hooks?.resolveFollowUpAutoContinue?.("Add a timer") === true &&
            localStorage.getItem("bryantlabs.followUpReviewFirst") === "0"
          );
        });
      })
      .toBe(true);
    await submitFollowUp(page, TIMER_PROMPT);
    await expect
      .poll(async () => {
        const snapshot = await page.evaluate(() => {
          const pipeline = window.__studioTestHooks?.getPatchPipelineState?.();
          const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
          return {
            phase: pipeline?.planApplyPhase ?? null,
            prompt: pipeline?.prompt ?? null,
            planApplyError: pipeline?.planApplyError ?? null,
            buildError: pipeline?.buildError ?? null,
            files: pipeline?.files ?? [],
            runResult: run?.runResult ?? null,
          };
        });
        const appFile = await readApp(projectDir).catch(() => "");
        return {
          pausedForReview: snapshot.phase === "waiting_for_review",
          hasMarker: appFile.includes("mock: timer"),
          prompt: snapshot.prompt,
          planApplyError: snapshot.planApplyError,
          buildError: snapshot.buildError,
          files: snapshot.files,
          runResult: snapshot.runResult,
          appExcerpt: appFile.slice(-240),
        };
      }, { timeout: 60_000 })
      .toMatchObject({ pausedForReview: false, hasMarker: true });
    await expect(page.getByRole("button", { name: "Accept all" })).toHaveCount(0);
  });
});
