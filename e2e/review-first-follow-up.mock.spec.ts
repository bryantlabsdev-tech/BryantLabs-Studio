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
  sendAgentPromptHandlingSubmitGates,
  sudokuFixturePath,
  waitForComposerReady,
  waitForFollowUpApplyTerminal,
  waitForWorkbenchDiffTab,
  assertNoRenderLoopConsoleErrors,
  type AgentSubmitSnapshot,
} from "./helpers/studio";

const HISTORY_REL = "src/components/History.tsx";
const APP_REL = "src/App.tsx";
const MIXED_PROMPT =
  "Add calculation history. Show last 10 calculations. Create a separate History component. Add a clear history button.";
const TIMER_PROMPT = "Add a timer";

async function copySudokuWorkspace(prefix = "bl-review-first-e2e-"): Promise<string> {
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), prefix));
  await fs.cp(sudokuFixturePath, dest, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}node_modules`) && !src.includes(".bryantlabs"),
  });
  return fs.realpath(dest);
}

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function normalizeNewlines(text: string): Promise<string> {
  return text.replace(/\r\n/g, "\n");
}

async function readAppAt(projectDir: string): Promise<string> {
  const raw = await fs.readFile(path.join(projectDir, APP_REL), "utf8");
  return normalizeNewlines(raw);
}

async function resolveOpenedProjectDir(page: Page, fallbackDir: string): Promise<string> {
  const raw = await page.evaluate(
    () => window.__studioTestHooks?.getReadinessState?.()?.projectPath ?? null,
  );
  const candidate = raw?.trim() ? raw : fallbackDir;
  return fs.realpath(candidate);
}

async function expectUnchangedDisk(projectDir: string, originalApp: string): Promise<void> {
  expect(await pathExists(path.join(projectDir, HISTORY_REL))).toBe(false);
  expect(await readAppAt(projectDir)).toBe(originalApp);
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

async function submitFollowUpConfirmingGates(
  page: Page,
  prompt: string,
): Promise<AgentSubmitSnapshot> {
  await waitForComposerReady(page);
  await resetForNewPrompt(page);
  await fillAgentPrompt(page, prompt);
  const before = await sendAgentPromptHandlingSubmitGates(page);
  await dismissBlockingDialogs(page);
  return before;
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

async function captureFollowUpApplyTrace(page: Page, submittedPrompt: string) {
  return page.evaluate((prompt) => {
    const hooks = window.__studioTestHooks;
    const pipeline = hooks?.getPatchPipelineState?.();
    const diagnostic = hooks?.getFollowUpSettlementDiagnostic?.();
    const run = hooks?.getGreenfieldRunSnapshot?.();
    const ready = hooks?.getReadinessState?.();
    const verifyErrors =
      run?.entries
        ?.filter((entry) => entry.stage === "verification" && entry.status === "failed")
        .map((entry) => entry.message) ?? [];
    return {
      submittedPrompt: prompt,
      composerValue: (document.querySelector("#build-prompt") as HTMLTextAreaElement | null)?.value ?? null,
      selectedRoute: diagnostic?.selectedRoutingDecision ?? run?.routeDecision?.selectedRoute ?? null,
      routingReason: diagnostic?.routingReason ?? run?.routeDecision?.selectionReason ?? null,
      runId: pipeline?.activeAgentRunId ?? diagnostic?.activeRunId ?? null,
      submitEventId: diagnostic?.submitEventId ?? null,
      applyPlanInvocations: diagnostic?.applyPlanInvocations ?? 0,
      generateInvocations: diagnostic?.generateInvocations ?? 0,
      planApplyPhase: pipeline?.planApplyPhase ?? null,
      proposedFiles: (pipeline?.files ?? []).map((file) => ({
        relPath: file.relPath,
        status: file.status,
        changed: file.changed,
        error: file.error,
      })),
      autoContinue: hooks?.resolveFollowUpAutoContinue?.(prompt) ?? null,
      reviewFirst: hooks?.getFollowUpReviewFirst?.() ?? null,
      planApplyError: pipeline?.planApplyError ?? null,
      buildError: pipeline?.buildError ?? null,
      verifyErrors,
      runResult: run?.runResult ?? null,
      projectPath: ready?.projectPath ?? null,
    };
  }, submittedPrompt);
}

function attachMockApplyLogs(app: ElectronApplication): string[] {
  const logs: string[] = [];
  const collect = (chunk: Buffer | string) => {
    const text = String(chunk);
    if (text.includes("[mock:apply_plan]")) logs.push(text.trim());
  };
  app.process()?.stdout?.on("data", collect);
  app.process()?.stderr?.on("data", collect);
  return logs;
}

async function expectTimerAutoApplied(
  page: Page,
  projectDir: string,
  before: AgentSubmitSnapshot,
  mockLogs: string[],
): Promise<void> {
  const openedDir = await resolveOpenedProjectDir(page, projectDir);
  expect(openedDir).toBe(projectDir);

  const terminal = await waitForFollowUpApplyTerminal(page, before);
  const trace = await captureFollowUpApplyTrace(page, TIMER_PROMPT);
  const appFile = await readAppAt(openedDir);
  const report = {
    terminal,
    mockApplyLogs: mockLogs,
    trace,
    appExcerpt: appFile.slice(-240),
    hasMarker: appFile.includes("mock: timer"),
  };

  expect(trace.submittedPrompt).toBe(TIMER_PROMPT);
  expect(trace.autoContinue).toBe(true);
  expect(trace.reviewFirst).toBe(false);
  expect(terminal, JSON.stringify(report)).not.toBe("waiting_for_review");
  expect(terminal, JSON.stringify(report)).not.toBe("stale_gate");
  expect(terminal, JSON.stringify(report)).toBe("applied");
  expect(
    trace.proposedFiles.some(
      (file) => file.relPath.replaceAll("\\", "/") === APP_REL && file.changed,
    ),
    JSON.stringify(report),
  ).toBe(true);
  expect(report.hasMarker, JSON.stringify(report)).toBe(true);
  await expect(page.getByRole("button", { name: "Accept all" })).toHaveCount(0);
}

test.describe("Review-first follow-up (mock provider)", () => {
  let app: ElectronApplication | undefined;
  let page: Page | undefined;
  let projectDir: string;
  let originalApp: string;

  test.beforeAll(async () => {
    projectDir = await copySudokuWorkspace();
    originalApp = await readAppAt(projectDir);
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

  test("review-first mixed proposal, bulk actions, regenerate, reject, accept, and undo", async () => {
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
        const appFile = await readAppAt(projectDir).catch(() => originalApp);
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
        const appFile = await readAppAt(projectDir).catch(() => "");
        return { created, app: appFile };
      }, { timeout: 30_000 })
      .toEqual({ created: false, app: originalApp });
  });
});

test.describe("Review-first opt-out auto-apply (fresh app)", () => {
  let app: ElectronApplication | undefined;
  let page: Page | undefined;
  let projectDir: string;
  let userDataDir: string;
  let originalApp: string;
  let mockLogs: string[] = [];

  test.beforeEach(async () => {
    projectDir = await copySudokuWorkspace("bl-review-first-optout-");
    userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-review-first-optout-user-"));
    originalApp = await readAppAt(projectDir);
    app = await launchStudioApp({ e2eProject: null, userDataDir });
    mockLogs = attachMockApplyLogs(app);
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openFixtureProject(page, projectDir);
    await waitForComposerReady(page);
  });

  test.afterEach(async () => {
    try {
      if (page) await assertNoRenderLoopConsoleErrors(page);
    } finally {
      await closeStudioApp(app);
      app = undefined;
      page = undefined;
      if (projectDir) {
        await fs.rm(projectDir, { recursive: true, force: true }).catch(() => undefined);
      }
      if (userDataDir) {
        await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  });

  test("opting out review-first auto-applies an ordinary timer follow-up", async () => {
    test.setTimeout(180_000);

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
      .toEqual({ stored: null, reviewFirst: true, autoContinue: false });

    await turnOffReviewFirst(page);
    const before = await submitFollowUpConfirmingGates(page, TIMER_PROMPT);
    await expectTimerAutoApplied(page, projectDir, before, mockLogs);
    expect(await readAppAt(projectDir)).not.toBe(originalApp);
  });
});
