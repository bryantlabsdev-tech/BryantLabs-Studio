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

  const useMock = opts?.mockProvider !== false && !realProviderE2eEnabled();
  if (useMock) {
    env.BRYANTLABS_MOCK_PROVIDER = "1";
  } else {
    delete env.BRYANTLABS_MOCK_PROVIDER;
  }

  if (realProviderE2eEnabled() || opts?.mockProvider === false) {
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
  } else if (realProviderE2eEnabled() || opts?.mockProvider === false) {
    env.BRYANTLABS_E2E_USER_DATA = await fs.mkdtemp(
      path.join(os.tmpdir(), "bryantlabs-e2e-real-"),
    );
  }

  if (useDistBuild()) {
    delete env.VITE_DEV_SERVER_URL;
  } else {
    env.VITE_DEV_SERVER_URL = env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
  }

  return electron.launch({
    args: ["."],
    cwd: projectRoot,
    env,
    timeout: 120_000,
  });
}

export async function getMainWindow(app: ElectronApplication): Promise<Page> {
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  await waitForStudioTestHooks(page);
  return page;
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

  const dismissMemory = page.getByRole("button", { name: /^Dismiss$/i });
  if (await dismissMemory.isVisible().catch(() => false)) {
    await dismissMemory.click();
  }
}

export async function resetSudokuFixturePersistence(
  fixturePath = sudokuFixturePath,
): Promise<void> {
  const bryantlabsDir = path.join(fixturePath, ".bryantlabs");
  const sessionPath = path.join(bryantlabsDir, "session-memory.json");
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
  await fs.writeFile(sessionPath, `${JSON.stringify(payload, null, 2)}\n`);
  await fs.rm(path.join(bryantlabsDir, "agent-run-history.json"), { force: true }).catch(() => {});
  const entries = await fs.readdir(bryantlabsDir).catch(() => [] as string[]);
  await Promise.all(
    entries
      .filter((name) => name.includes("run-checkpoint"))
      .map((name) => fs.rm(path.join(bryantlabsDir, name), { force: true })),
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

export async function waitForComposerReady(page: Page): Promise<void> {
  await page.waitForFunction(
    () => window.__studioTestHooks?.getReadinessState?.()?.composerReady === true,
    undefined,
    { timeout: READINESS_TIMEOUT_MS },
  );
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
  await page.locator("#build-prompt").waitFor({ state: "visible", timeout: READINESS_TIMEOUT_MS });
  await page.evaluate(() => {
    localStorage.removeItem("bryantlabs.providerCircuit.v1");
  });
  await openFixtureProject(page);
  await waitForComposerReady(page);
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

  const outcome = await Promise.race([
    page
      .waitForEvent("console", {
        predicate: (msg) => msg.text().includes("[greenfield:complete]"),
        timeout: GREENFIELD_TERMINAL_TIMEOUT_MS,
      })
      .then(() => "success" as const),
    page
      .waitForEvent("console", {
        predicate: (msg) => msg.text().includes("[greenfield:failed]"),
        timeout: GREENFIELD_TERMINAL_TIMEOUT_MS,
      })
      .then(() => "failed" as const),
    page
      .waitForFunction(
        () => {
          const run = window.__studioTestHooks?.getReadinessState?.()?.greenfieldRun;
          return run?.runResult === "success" || run?.runResult === "failed";
        },
        undefined,
        { timeout: GREENFIELD_TERMINAL_TIMEOUT_MS },
      )
      .then(async () => {
        const run = await page.evaluate(
          () => window.__studioTestHooks?.getReadinessState?.()?.greenfieldRun.runResult,
        );
        return run === "success" ? ("success" as const) : ("failed" as const);
      }),
  ]);

  return outcome;
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

  if (await page.getByTestId("run-review-actions").isVisible().catch(() => false)) {
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
  await page.waitForFunction(
    () => {
      const state = window.__studioTestHooks?.getPatchPipelineState?.();
      if (!state) return false;
      if (
        state.planApplyPhase === "waiting_for_review" ||
        state.planApplyPhase === "review" ||
        state.planApplyPhase === "verifying" ||
        state.planApplyPhase === "done"
      ) {
        return true;
      }
      if (state.planApplyError?.includes("Patch generated but not applied")) return true;
      if (state.planApplyError) return true;
      if (state.buildPhase === "review") return true;
      if (state.buildPhase === "failed" || state.buildPhase === "completed") return true;
      if (!state.buildRunning && Boolean(state.buildError)) return true;
      if (!state.buildRunning && state.aiPlanStatus === "error") return true;
      return false;
    },
    undefined,
    { timeout: PATCH_PIPELINE_TIMEOUT_MS },
  );

  const outcome = await readPatchPipelineOutcome(page);
  if (outcome) return outcome;

  throw new Error("Patch pipeline reached a terminal hook state without a mapped outcome.");
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
    () => window.__studioTestHooks?.getPatchPipelineState?.()?.centerTab === "diff",
    undefined,
    { timeout: READINESS_TIMEOUT_MS },
  );
}
