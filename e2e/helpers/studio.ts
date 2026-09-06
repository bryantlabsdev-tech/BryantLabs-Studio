import path from "node:path";
import fs from "node:fs/promises";
import os from "node:os";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import type { ElectronApplication, Page } from "playwright";
import { _electron as electron } from "playwright";

const execFileAsync = promisify(execFile);

const e2eDir = path.dirname(fileURLToPath(import.meta.url));
export const projectRoot = path.resolve(e2eDir, "../..");
export const sudokuFixturePath = path.resolve(
  projectRoot,
  "e2e/fixtures/sudoku-vite",
);
export const emptyProjectFixturePath = path.resolve(
  projectRoot,
  "e2e/fixtures/empty-project",
);

const READINESS_TIMEOUT_MS = 30_000;
const GREENFIELD_TERMINAL_TIMEOUT_MS = 120_000;
const PATCH_PIPELINE_TIMEOUT_MS = 90_000;

export function useDistBuild(): boolean {
  return process.env.PLAYWRIGHT_USE_DIST === "1";
}

export function mockProviderEnabled(): boolean {
  return process.env.BRYANTLABS_MOCK_PROVIDER === "1";
}

export function realProviderE2eEnabled(): boolean {
  return process.env.BRYANTLABS_E2E_REAL_PROVIDER === "1";
}

export async function launchStudioApp(opts?: {
  e2eProject?: string | null;
  mockProvider?: boolean;
  userDataDir?: string;
}): Promise<ElectronApplication> {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;

  // Explicit mock mode must win over a leftover REAL_PROVIDER flag in the shell.
  const forceMock =
    opts?.mockProvider === true || process.env.BRYANTLABS_MOCK_PROVIDER === "1";
  const forceReal =
    opts?.mockProvider === false || realProviderE2eEnabled();
  const useMock = forceMock ? true : !forceReal;
  if (useMock) {
    env.BRYANTLABS_MOCK_PROVIDER = "1";
    delete env.BRYANTLABS_E2E_REAL_PROVIDER;
  } else {
    delete env.BRYANTLABS_MOCK_PROVIDER;
    env.BRYANTLABS_E2E_REAL_PROVIDER = "1";
  }

  env.VITE_BRYANTLABS_E2E = "1";
  if (opts?.e2eProject === null) {
    delete env.BRYANTLABS_E2E_PROJECT;
  } else {
    env.BRYANTLABS_E2E_PROJECT = opts?.e2eProject ?? sudokuFixturePath;
  }

  if (opts?.userDataDir) {
    env.BRYANTLABS_E2E_USER_DATA = opts.userDataDir;
  } else if (!useMock) {
    env.BRYANTLABS_E2E_USER_DATA = await fs.mkdtemp(
      path.join(os.tmpdir(), "bryantlabs-e2e-real-"),
    );
  }

  if (useDistBuild()) {
    delete env.VITE_DEV_SERVER_URL;
  } else {
    env.VITE_DEV_SERVER_URL = env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
  }

  launchRenderLoopErrors.length = 0;
  const app = await electron.launch({
    args: ["."],
    cwd: projectRoot,
    env,
    timeout: 120_000,
  });
  const captureLaunch = (text: string) => {
    if (/Maximum update depth exceeded/i.test(text)) {
      launchRenderLoopErrors.push(text);
    }
  };
  app.on("window", (page) => {
    installRenderLoopConsoleGuard(page);
  });
  try {
    app.context().on("console", (msg) => captureLaunch(msg.text()));
  } catch {
    // Electron context may not expose console until a window exists.
  }
  app.process().stdout?.on("data", (buf: Buffer | string) => {
    captureLaunch(String(buf));
  });
  app.process().stderr?.on("data", (buf: Buffer | string) => {
    captureLaunch(String(buf));
  });
  return app;
}

export async function getMainWindow(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow();
  installRenderLoopConsoleGuard(page);
  await page.waitForLoadState("domcontentloaded");
  await waitForStudioTestHooks(page);
  return page;
}

const renderLoopErrors = new WeakMap<Page, string[]>();
const launchRenderLoopErrors: string[] = [];

export function installRenderLoopConsoleGuard(page: Page): void {
  if (renderLoopErrors.has(page)) return;
  const errors: string[] = [];
  renderLoopErrors.set(page, errors);
  const capture = (text: string) => {
    if (/Maximum update depth exceeded/i.test(text)) {
      errors.push(text);
    }
  };
  page.on("console", (msg) => capture(msg.text()));
  page.on("pageerror", (err) => capture(err.message));
}

export async function assertNoRenderLoopConsoleErrors(page: Page): Promise<void> {
  const recorded = await page
    .evaluate(() => window.__studioMaxUpdateDepthErrors ?? [])
    .catch(() => [] as string[]);
  const errors = [
    ...(renderLoopErrors.get(page) ?? []),
    ...launchRenderLoopErrors,
    ...recorded,
  ];
  if (errors.length > 0) {
    throw new Error(
      `React maximum update depth exceeded (${errors.length} time(s)): ${errors[0]}`,
    );
  }
}

export async function dismissBlockingDialogs(page: Page): Promise<void> {
  const abandon = page.getByRole("button", { name: /^Abandon$/i });
  if (await abandon.isVisible().catch(() => false)) {
    await abandon.click();
  }

  const rejectAll = page.getByRole("button", { name: /reject all/i });
  if (await rejectAll.isVisible().catch(() => false)) {
    await rejectAll.click();
  }

  const dismissMemory = page.locator(".memory-suggest").getByRole("button", { name: /^Dismiss$/i });
  if (await dismissMemory.isVisible().catch(() => false)) {
    await dismissMemory.click();
  }
}

export async function resetSudokuFixturePersistence(
  fixturePath = sudokuFixturePath,
): Promise<void> {
  const bryantlabsDir = path.join(fixturePath, ".bryantlabs");
  await fs.rm(bryantlabsDir, { recursive: true, force: true }).catch(() => {});
  const payload = {
    version: 1,
    projectPath: fixturePath,
    branch: null,
    lastPrompt: null,
    prompts: [],
    plans: [],
    modifiedFiles: [],
    failures: [],
    autoFixes: [],
    providerHistory: [],
    runSummaries: [],
  };
  await fs.mkdir(bryantlabsDir, { recursive: true });
  await fs.writeFile(
    path.join(bryantlabsDir, "session-memory.json"),
    `${JSON.stringify(payload, null, 2)}\n`,
  );
}

async function removeFixtureEntry(fixturePath: string, name: string): Promise<void> {
  const target = path.join(fixturePath, name);
  try {
    await fs.rm(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
  } catch {
    await execFileAsync("rm", ["-rf", target]);
  }
}

/** Restore the empty-project fixture to a folder with no generated app files. */
export async function resetEmptyProjectFixture(
  fixturePath = emptyProjectFixturePath,
): Promise<void> {
  await resetSudokuFixturePersistence(fixturePath);
  const preserved = new Set([".bryantlabs", ".gitkeep"]);
  const entries = await fs.readdir(fixturePath).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter((name) => !preserved.has(name))
      .map((name) => removeFixtureEntry(fixturePath, name)),
  );
  await fs.writeFile(path.join(fixturePath, ".gitkeep"), "\n").catch(() => {});
}

export async function waitForStudioTestHooks(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const hooks = window.__studioTestHooks;
      return (
        typeof hooks?.getReadinessState === "function" &&
        typeof hooks?.openProjectAt === "function" &&
        hooks.getReadinessState()?.hooksReady === true
      );
    },
    undefined,
    { timeout: READINESS_TIMEOUT_MS },
  );
}

export async function waitForProjectReady(
  page: Page,
  expectedPath?: string,
): Promise<void> {
  await page.waitForFunction(
    (path) => {
      const state = window.__studioTestHooks?.getReadinessState?.();
      if (!state?.desktopApiReady || !state.projectPath) return false;
      if (path && state.projectPath !== path) return false;
      return state.scanStatus !== "scanning";
    },
    expectedPath ?? null,
    { timeout: READINESS_TIMEOUT_MS },
  );
}

export async function openExistingProjectAt(
  page: Page,
  folderPath: string,
): Promise<void> {
  await waitForStudioTestHooks(page);
  await page.evaluate(async (targetPath) => {
    const hooks = window.__studioTestHooks;
    if (!hooks?.openProjectAt) {
      throw new Error("Studio test hooks are not available");
    }
    await hooks.openProjectAt(targetPath);
  }, folderPath);

  await waitForProjectReady(page, folderPath);
}

export async function readIndexStatusLabel(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const el = document.querySelector(".index-status__label");
    return el?.textContent?.trim() ?? null;
  });
}

export async function readReadyIndexedFileCount(
  page: Page,
): Promise<number | null> {
  const label = await readIndexStatusLabel(page);
  if (!label) return null;
  const match = label.match(/Ready\s*[·-]\s*(\d+)\s*files/i);
  return match ? Number(match[1]!) : null;
}

export async function waitForComposerReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => window.__studioTestHooks?.getReadinessState?.()?.composerReady === true,
    undefined,
    { timeout: READINESS_TIMEOUT_MS },
  );

  // `composerReady` can be true even when no project is open (e.g. Welcome screen).
  // The concrete signal we need for agent submission is that the build prompt exists.
  await page.locator("#build-prompt").waitFor({ state: "visible", timeout: READINESS_TIMEOUT_MS });
}

export async function openFixtureProject(
  page: Page,
  fixturePath = sudokuFixturePath,
): Promise<void> {
  await resetSudokuFixturePersistence(fixturePath);
  await waitForStudioTestHooks(page);

  await page.evaluate(async (targetPath) => {
    localStorage.removeItem(`bryantlabs.agentRunHistory.${targetPath}`);
    localStorage.removeItem("bryantlabs.agentRunHistory.__bryantlabs-session__");
    localStorage.removeItem(`bryantlabs.followUpChat.${targetPath}`);
    localStorage.removeItem("bryantlabs.providerCircuit.v1");
    localStorage.removeItem("bryantlabs.followUpReviewFirst");
    localStorage.setItem("bryantlabs.useAgentLoopForEdits", "0");
    const hooks = window.__studioTestHooks;
    if (!hooks?.openProjectAt) {
      throw new Error("Studio test hooks are not available");
    }
    await hooks.openProjectAt(targetPath);
  }, fixturePath);

  await waitForProjectReady(page, fixturePath);
}

export async function waitForAgentReady(page: Page): Promise<void> {
  await dismissBlockingDialogs(page);
  await waitForStudioTestHooks(page);
  await openFixtureProject(page);
  await waitForComposerReady(page);
  await page.locator("#build-prompt").waitFor({ state: "visible", timeout: READINESS_TIMEOUT_MS });
}

export function composerExample(page: Page, label: string) {
  return page.locator(".build-view__example", { hasText: label });
}

export async function fillAgentPrompt(page: Page, text: string): Promise<void> {
  const prompt = page.locator("#build-prompt");
  await prompt.fill(text);
}

export async function sendAgentPrompt(page: Page): Promise<void> {
  await page.getByTestId("agent-send").click({ timeout: READINESS_TIMEOUT_MS });
}

export async function waitForPreviewPanelUrl(
  page: Page,
  port: number | string,
): Promise<void> {
  const portText = String(port);
  await page.waitForFunction(
    (expectedPort) => {
      const state = window.__studioTestHooks?.getReadinessState?.();
      if (!state?.previewPanel.visible) return false;
      if (!state.previewPanel.url?.includes(expectedPort)) return false;
      const el = document.querySelector('[data-testid="preview-panel-url"]');
      return Boolean(el?.textContent?.includes(expectedPort));
    },
    portText,
    { timeout: READINESS_TIMEOUT_MS },
  );
}

export async function waitForGreenfieldRunStarted(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const run = window.__studioTestHooks?.getReadinessState?.()?.greenfieldRun;
      if (!run) return false;
      if (run.runResult === "success" || run.runResult === "failed") return true;
      return (
        run.active ||
        run.runResult === "running" ||
        run.genStatus !== "idle" ||
        run.writeStatus !== "idle" ||
        run.setupStatus !== "idle"
      );
    },
    undefined,
    { timeout: READINESS_TIMEOUT_MS },
  );
}

export async function waitForGreenfieldRunTerminal(
  page: Page,
): Promise<"success" | "failed"> {
  await waitForGreenfieldRunStarted(page);

  // Prefer the app's structured readiness state over console markers:
  // - Electron sometimes doesn't surface console logs the same way Playwright expects.
  // - The greenfield run can also terminate as cancelled/aborted/interrupted, not just success/failed.
  try {
    await page.waitForFunction(
      () => {
        const run = window.__studioTestHooks?.getReadinessState?.()?.greenfieldRun;
        if (!run) return false;
        return (
          run.runResult === "success" ||
          run.runResult === "failed" ||
          run.runResult === "cancelled" ||
          run.runResult === "aborted" ||
          run.runResult === "interrupted"
        );
      },
      undefined,
      { timeout: GREENFIELD_TERMINAL_TIMEOUT_MS },
    );
  } catch (err) {
    const debug = await page.evaluate(() => {
      const state = window.__studioTestHooks?.getReadinessState?.();
      const run = state?.greenfieldRun;
      if (!run || !state) return null;
      return {
        projectPath: state.projectPath,
        scanStatus: state.scanStatus,
        composerReady: state.composerReady,
        composerBlockReason: state.composerBlockReason,
        previewVisible: state.previewPanel.visible,
        previewRunning: state.previewPanel.running,
        greenfieldRun: {
          runResult: run.runResult,
          active: run.active,
          setupStatus: run.setupStatus,
          genStatus: run.genStatus,
          writeStatus: run.writeStatus,
          lastFailureReason: run.lastFailureReason,
        },
      };
    });
    throw new Error(
      `Greenfield run did not reach a terminal state within ${
        GREENFIELD_TERMINAL_TIMEOUT_MS / 1000
      }s. Debug=${JSON.stringify(debug)}`,
    );
  }

  const runResult = await page.evaluate(
    () => window.__studioTestHooks?.getReadinessState?.()?.greenfieldRun.runResult,
  );
  return runResult === "success" ? "success" : "failed";
}

export async function waitForRoutingIntent(
  page: Page,
  opts?: { intent?: "feature_addition" | "small_ui"; timeoutMs?: number },
): Promise<NonNullable<ReturnType<NonNullable<Window["__studioTestHooks"]>["getRoutingState"]>>> {
  const timeoutMs = opts?.timeoutMs ?? PATCH_PIPELINE_TIMEOUT_MS;
  await page.waitForFunction(
    (expectedIntent) => {
      const routing = window.__studioTestHooks?.getRoutingState?.();
      if (!routing) return false;
      if (expectedIntent && routing.intent !== expectedIntent) return false;
      return true;
    },
    opts?.intent ?? null,
    { timeout: timeoutMs },
  );
  const routing = await page.evaluate(() => window.__studioTestHooks?.getRoutingState?.());
  if (!routing) {
    throw new Error("Routing intent hook returned null after wait");
  }
  return routing;
}

export async function waitForConsolePattern(
  page: Page,
  pattern: RegExp,
  timeoutMs = READINESS_TIMEOUT_MS,
): Promise<string> {
  const msg = await page.waitForEvent("console", {
    predicate: (event) => pattern.test(event.text()),
    timeout: timeoutMs,
  });
  return msg.text();
}

export type PatchPipelineOutcome =
  | "waiting_for_review"
  | "patch_applied"
  | "verification_started"
  | "apply_failed"
  | "watchdog_failed"
  | "ready_for_apply";

function patchPipelineOutcomeFromState(
  state: NonNullable<ReturnType<NonNullable<Window["__studioTestHooks"]>["getPatchPipelineState"]>>,
): PatchPipelineOutcome | null {
  if (state.planApplyPhase === "waiting_for_review" || state.planApplyPhase === "review") {
    return "waiting_for_review";
  }
  if (state.planApplyPhase === "verifying") return "verification_started";
  if (state.planApplyPhase === "done") return "patch_applied";
  if (state.planApplyError?.includes("Patch generated but not applied")) {
    return "watchdog_failed";
  }
  if (state.planApplyError) return "apply_failed";
  if (state.buildPhase === "failed") return "apply_failed";
  if (state.buildError) return "apply_failed";
  if (state.aiPlanStatus === "error") return "apply_failed";
  if (state.buildPhase === "review") return "waiting_for_review";
  if (state.buildPhase === "completed") return "patch_applied";
  return null;
}

async function readPatchPipelineOutcome(page: Page): Promise<PatchPipelineOutcome | null> {
  const state = await page.evaluate(() => {
    const hooks = window.__studioTestHooks;
    return hooks?.getPatchPipelineState?.() ?? null;
  });
  if (!state) return null;

  const hookOutcome = patchPipelineOutcomeFromState(state);
  if (hookOutcome) return hookOutcome;

  if (await page.getByTestId("agent-review-chip").isVisible().catch(() => false)) {
    return "waiting_for_review";
  }
  if (await page.getByTestId("run-failure-card").isVisible().catch(() => false)) {
    return "apply_failed";
  }
  return null;
}

/** Wait for patch pipeline to reach review, apply, verify, or a visible failure. */
export async function waitForPostPatchProgress(
  page: Page,
): Promise<PatchPipelineOutcome> {
  const started = Date.now();
  let lastState: PatchPipelineState | null = null;

  while (Date.now() - started < PATCH_PIPELINE_TIMEOUT_MS) {
    const outcome = await readPatchPipelineOutcome(page);
    if (outcome) return outcome;

    lastState = await page.evaluate(
      () => window.__studioTestHooks?.getPatchPipelineState?.() ?? null,
    );

    await page.waitForTimeout(300);
  }

  throw new Error(
    `Patch pipeline timed out after ${PATCH_PIPELINE_TIMEOUT_MS / 1000}s. state=${JSON.stringify(lastState)}`,
  );
}

/** Wait until follow-up patches are applied and verification finishes. */
export async function waitForPatchApplied(page: Page): Promise<PatchPipelineOutcome> {
  try {
    await page.waitForFunction(
      () => {
        const pipeline = window.__studioTestHooks?.getPatchPipelineState?.();
        if (!pipeline) return false;

        if (pipeline.planApplyError) return true;
        if (pipeline.buildPhase === "failed") return true;
        if (pipeline.aiPlanStatus === "error") return true;
        if (pipeline.planApplyPhase === "done") return true;

        const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
        if (!run) return false;

        const wroteFiles = run.entries?.some(
          (e) =>
            e.stage === "apply_plan" &&
            e.status === "success" &&
            /Wrote \d+ file/i.test(e.message),
        );
        const verifyDone = run.entries?.some(
          (e) =>
            e.stage === "verification" &&
            (e.status === "success" || e.status === "failed"),
        );
        const noRunning = !run.entries?.some((e) => e.status === "running");

        if (wroteFiles && verifyDone && noRunning && !pipeline.buildRunning) {
          return true;
        }

        return run.runResult === "success" || run.runResult === "failed";
      },
      undefined,
      { timeout: PATCH_PIPELINE_TIMEOUT_MS },
    );
  } catch (err) {
    const debug = await page.evaluate(() => {
      const pipeline = window.__studioTestHooks?.getPatchPipelineState?.();
      const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
      return {
        pipeline,
        runResult: run?.runResult ?? null,
        entries: run?.entries?.slice(-8) ?? [],
      };
    });
    throw new Error(
      `Patch apply did not finish within ${PATCH_PIPELINE_TIMEOUT_MS / 1000}s. Debug=${JSON.stringify(debug)}`,
    );
  }

  const outcome = await readPatchPipelineOutcome(page);
  if (outcome === "verification_started" || outcome === "patch_applied") {
    const verifyOk = await page.evaluate(() => {
      const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
      return run?.entries?.some(
        (e) => e.stage === "verification" && e.status === "success",
      );
    });
    if (verifyOk) return "patch_applied";
  }
  if (outcome) return outcome;
  return "patch_applied";
}

/** Wait until follow-up patches are applied and verification finishes. */
export async function waitForPatchApplied(page: Page): Promise<PatchPipelineOutcome> {
  try {
    await page.waitForFunction(
      () => {
        const pipeline = window.__studioTestHooks?.getPatchPipelineState?.();
        if (!pipeline) return false;

        if (
          pipeline.planApplyPhase === "proposing" ||
          pipeline.planApplyPhase === "applying" ||
          pipeline.planApplyPhase === "verifying"
        ) {
          return false;
        }
        if (pipeline.planApplyError) return true;
        if (pipeline.buildPhase === "failed") return true;
        if (pipeline.aiPlanStatus === "error") return true;
        if (pipeline.planApplyPhase === "done") return true;
        if (pipeline.planApplyPhase === "waiting_for_review") return true;

        const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
        if (!run) return false;

        const wroteFiles = run.entries?.some(
          (e) =>
            e.stage === "apply_plan" &&
            e.status === "success" &&
            /Wrote \d+ file/i.test(e.message),
        );
        const verifyDone = run.entries?.some(
          (e) =>
            e.stage === "verification" &&
            (e.status === "success" || e.status === "failed"),
        );
        const noRunning = !run.entries?.some((e) => e.status === "running");

        if (wroteFiles && verifyDone && noRunning && !pipeline.buildRunning) {
          return true;
        }

        if (
          pipeline.planApplyPhase === "proposing" ||
          pipeline.planApplyPhase === "applying" ||
          pipeline.planApplyPhase === "verifying"
        ) {
          return false;
        }
        return run.runResult === "success" || run.runResult === "failed";
      },
      undefined,
      { timeout: PATCH_PIPELINE_TIMEOUT_MS },
    );
  } catch (err) {
    const debug = await page.evaluate(() => {
      const pipeline = window.__studioTestHooks?.getPatchPipelineState?.();
      const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
      return {
        pipeline,
        runResult: run?.runResult ?? null,
        entries: run?.entries?.slice(-8) ?? [],
      };
    });
    throw new Error(
      `Patch apply did not finish within ${PATCH_PIPELINE_TIMEOUT_MS / 1000}s. Debug=${JSON.stringify(debug)}`,
    );
  }

  const outcome = await readPatchPipelineOutcome(page);
  if (outcome === "verification_started" || outcome === "patch_applied") {
    const verifyOk = await page.evaluate(() => {
      const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
      return run?.entries?.some(
        (e) => e.stage === "verification" && e.status === "success",
      );
    });
    if (verifyOk) return "patch_applied";
  }
  if (outcome) return outcome;
  return "patch_applied";
}

export async function waitForPatchReviewReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () =>
      window.__studioTestHooks?.getPatchPipelineState?.()?.planApplyPhase ===
      "waiting_for_review",
    undefined,
    { timeout: READINESS_TIMEOUT_MS },
  );
}

export async function waitForWorkbenchDiffTab(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const state = window.__studioTestHooks?.getPatchPipelineState?.();
      if (!state) return false;
      if (state.centerTab === "diff") return true;
      const reviewing =
        state.planApplyPhase === "waiting_for_review" ||
        state.planApplyPhase === "review";
      if (!reviewing) return false;
      return (
        state.centerTab === "editor" ||
        Boolean(document.querySelector('[data-testid="patch-review-panel"]'))
      );
    },
    undefined,
    { timeout: READINESS_TIMEOUT_MS },
  );
}

export async function readCenterTab(page: Page): Promise<string | null> {
  return page.evaluate(
    () => window.__studioTestHooks?.getPatchPipelineState?.()?.centerTab ?? null,
  );
}

export async function selectWorkbenchTab(
  page: Page,
  tab: "Editor" | "Execution" | "Preview" | "Diff" | "Studio Log",
): Promise<void> {
  await page.getByRole("tab", { name: tab, exact: true }).click();
}
