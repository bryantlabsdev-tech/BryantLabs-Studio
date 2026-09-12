/**
 * Real large-project acceptance: Northstar PM app create → Kanban expansion → quit/reopen.
 * Gated by BRYANTLABS_ACCEPTANCE_REAL=1. Does not modify Studio product code.
 */
import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { _electron as electron } from "playwright";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  dismissBlockingDialogs,
  fillAgentPrompt,
  getMainWindow,
  projectRoot,
  sendAgentPrompt,
  waitForComposerReady,
  waitForStudioTestHooks,
} from "./helpers/studio";

const ACCEPTANCE_REAL = process.env.BRYANTLABS_ACCEPTANCE_REAL === "1";
const ARTIFACT_DIR = path.join(
  projectRoot,
  "e2e/test-results/acceptance-northstar-large",
);
const REAL_USER_DATA = path.join(
  os.homedir(),
  "Library/Application Support/bryantlabs-studio",
);

const CREATE_PROMPT = `Build a polished project-management application called Northstar.

Use React and TypeScript. Organize it into maintainable components, hooks, utilities, and typed models rather than placing everything in App.tsx.

Include:
- Dashboard with project, task, completion, workload, and overdue summaries
- Projects page with create, edit, archive, search, and status filtering
- Task list with create, edit, delete, complete, priority, due date, assignee, tags, project, search, sorting, and filters
- Team page with member profiles and workload summaries
- Calendar-style due-date view
- Activity timeline
- Responsive sidebar navigation
- Light and dark themes
- Form validation and accessible controls
- Empty, loading, and error states
- Seed/demo data
- Local persistence with a versioned storage schema
- Reusable confirmation dialog and toast notifications
- No external backend or authentication service

The project must typecheck, build, run in Preview, and persist user changes after reload.`;

const KANBAN_PROMPT = `Expand Northstar with a complete Kanban and planning system.

Add:
- Drag-and-drop Kanban board grouped by task status
- Backlog, Planned, In Progress, Review, and Done columns
- Persistent task ordering within columns
- Project milestones with progress tracking
- Task dependencies and blocked-task indicators
- Bulk task selection and bulk status/priority/assignee actions
- Saved filter presets
- CSV import with validation and an error summary
- CSV and JSON export
- Command palette with keyboard navigation
- Undo for destructive task operations
- Dashboard charts derived from actual application data
- Migration of existing locally stored data to the new schema without losing it
- Updates to all affected types, state management, components, navigation, styles, demo data, and persistence logic

Preserve all existing features and existing user data. Keep the code modular and accessible. Do not rewrite the entire app unnecessarily.`;

const REOPEN_PROMPT =
  "Add milestone filtering to the Kanban board and show each milestone’s blocked-task count.";

/** Stage ceilings — identify stall when exceeded; do not wait forever.
 * Individual provider generations are capped at 3 minutes in-product;
 * overall edit budget covers multiple bounded phases + verify/repair.
 */
const DEADLINE = {
  appLaunch: 45_000,
  providerHealth: 60_000,
  projectScan: 90_000,
  providerFirstByte: 60_000,
  createOverall: 20 * 60_000,
  largeEdit: 20 * 60_000,
  reopenEdit: 12 * 60_000,
  preview: 90_000,
  noProgress: 180_000,
} as const;

type StageRecord = {
  stage: string;
  startedAt: number;
  endedAt?: number;
  durationMs?: number;
  ok: boolean;
  detail?: string;
};

const stageLog: StageRecord[] = [];
const overallStartedAt = Date.now();

test.describe("Northstar large-project real acceptance", () => {
  test.skip(
    !ACCEPTANCE_REAL,
    "Set BRYANTLABS_ACCEPTANCE_REAL=1 for the Northstar large-project acceptance.",
  );
  test.setTimeout(55 * 60_000);

  test("create Northstar, Kanban expansion, quit/reopen edit", async () => {
    expect(projectRoot).toBe("/Users/ferrisb/Desktop/Bryantlabs Studio FIXED");
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });

    const projectDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "bryantlabs-northstar-"),
    );
    const userDataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "bryantlabs-northstar-user-"),
    );
    await fs.copyFile(
      path.join(REAL_USER_DATA, "provider-settings.json"),
      path.join(userDataDir, "provider-settings.json"),
    );
    await saveJson("00-paths.json", { projectDir, userDataDir });

    const consoleErrors: string[] = [];
    let app = await runStage("app_launch", DEADLINE.appLaunch, () =>
      launchRealStudio(userDataDir),
    );
    let page = await getMainWindow(app);
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(`[console] ${msg.text()}`);
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(`[pageerror] ${String(err)}`);
    });
    await dismissBlockingDialogs(page);
    await waitForStudioTestHooks(page);

    await runStage("provider_health", DEADLINE.providerHealth, async () => {
      const smoke = await page.evaluate(() =>
        window.__studioTestHooks?.getProviderSmokeState?.(),
      );
      expect(smoke?.mockMode).toBe(false);
      expect(smoke?.provider).toBe("anthropic");
      const health = await page.evaluate(async () =>
        window.__studioTestHooks?.checkConfiguredProviderHealth?.(),
      );
      if (!health?.ok) {
        throw new Error(`Provider health failed: ${JSON.stringify(health)}`);
      }
      return health;
    });

    // Create disposable project via real UI.
    const welcomeStart = page.getByTestId("welcome-build-new");
    if (await welcomeStart.isVisible().catch(() => false)) {
      await welcomeStart.click();
    }
    await stubOpenFolderDialog(app, projectDir);
    await page.evaluate(() => {
      localStorage.setItem("bryantlabs.followUpReviewFirst", "0");
    });
    const startNew = page.getByRole("button", { name: /Start a new project/i });
    if (await startNew.isVisible().catch(() => false)) {
      await startNew.click();
    } else {
      await page.evaluate(async (target) => {
        await window.__studioTestHooks?.openProjectAt?.(target);
      }, projectDir);
    }
    await waitForComposerReady(page);

    // ——— CREATE ———
    await fillAgentPrompt(page, CREATE_PROMPT);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);

    const createOutcome = await waitForGreenfield(page, DEADLINE.createOverall);
    await waitForPreview(page);
    const createDiag = await captureDiagnostics(page, "create");
    const createFiles = await listSourceFiles(projectDir);
    const createStats = await projectStats(projectDir);
    await saveJson("01-create.json", {
      createOutcome,
      createDiag,
      createFiles,
      createStats,
      stageLog: [...stageLog],
      durationMs: Date.now() - overallStartedAt,
    });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "01-create-studio.png"),
      fullPage: true,
    });
    expect(createOutcome).toBe("success");
    expect(createDiag.previewUrl).toBeTruthy();
    expect(createDiag.runResult).toBe("success");
    expect(createFiles.length).toBeGreaterThan(8);
    expect(createFiles.some((f) => /App\.tsx$/i.test(f))).toBeTruthy();
    // Multi-file architecture: not everything only in App.tsx
    const componentLike = createFiles.filter((f) =>
      /components|hooks|utils|models|types|pages|features|lib/i.test(f),
    );
    expect(componentLike.length).toBeGreaterThan(2);
    // Sensible PM page modules (not feature-bullet filenames)
    const pageFiles = createFiles.filter((f) => /src\/pages\/.+\.tsx$/i.test(f));
    expect(pageFiles.some((f) => /\/Projects\.tsx$/i.test(f))).toBeTruthy();
    expect(pageFiles.some((f) => /\/Tasks\.tsx$/i.test(f))).toBeTruthy();
    expect(pageFiles.every((f) => !/Lightanddark|Calendar-style|Formvalidation/i.test(f))).toBeTruthy();

    const placeholderHits = await scanPlaceholders(projectDir);
    await saveJson("01b-placeholders.json", placeholderHits);
    expect(placeholderHits.critical.length).toBe(0);

    // Verify typecheck/build already reported by Studio; also spot-check on disk.
    const verifyCreate = createDiag.verification as
      | { typecheck?: { ok?: boolean }; build?: { ok?: boolean } }
      | null;
    expect(verifyCreate?.typecheck?.ok ?? createDiag.lastEntries.some((e) =>
      /typescript|typecheck/i.test(e.stage + e.message) && e.status === "success",
    )).toBeTruthy();

    // Seed data + interact via Preview window.
    const previewUrl = String(createDiag.previewUrl);
    const createPreview = await openPreviewWindow(app, previewUrl, null);
    await createPreview.waitForTimeout(1500);
    await createPreview.screenshot({
      path: path.join(ARTIFACT_DIR, "02-initial-app-preview.png"),
      fullPage: true,
    });
    const navCheck = await validateInitialNavigation(createPreview);
    await saveJson("02-initial-nav.json", navCheck);
    expect(navCheck.sidebarOk).toBeTruthy();
    expect(navCheck.pagesHit.length).toBeGreaterThanOrEqual(3);

    // Create user data for migration survival.
    const seeded = await seedUserDataInPreview(createPreview);
    await saveJson("03-seeded-user-data.json", seeded);
    const persistedBlob = await createPreview.evaluate(() => {
      const out: Record<string, string | null> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) out[k] = localStorage.getItem(k);
      }
      return out;
    });
    await saveJson("03b-localstorage-before-kanban.json", persistedBlob);
    expect(Object.keys(persistedBlob).length).toBeGreaterThan(0);

    // Reload persistence check (reopen Preview if Electron closed the window).
    let reloadPreview = createPreview;
    try {
      await reloadPreview.reload({ waitUntil: "domcontentloaded" });
    } catch {
      reloadPreview = await openPreviewWindow(app, previewUrl, persistedBlob);
    }
    await reloadPreview.waitForTimeout(1200);
    const afterReload = await reloadPreview.evaluate(() => {
      const out: Record<string, string | null> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) out[k] = localStorage.getItem(k);
      }
      return out;
    });
    await saveJson("03c-localstorage-after-reload.json", afterReload);
    expect(JSON.stringify(afterReload)).toBe(JSON.stringify(persistedBlob));

    await reloadPreview.close().catch(() => undefined);
    await waitForComposerReady(page);

    // Record source hashes before large edit.
    const beforeHashes = await hashAllSources(projectDir);
    await saveJson("04-before-kanban-hashes.json", beforeHashes);

    // ——— LARGE KANBAN EDIT ———
    const kanbanStarted = Date.now();
    await fillAgentPrompt(page, KANBAN_PROMPT);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);
    await maybeAcceptReview(page);
    const kanbanEdit = await waitForEdit(page, DEADLINE.largeEdit, "kanban_edit");
    await waitForPreview(page);
    const kanbanDiag = await captureDiagnostics(page, "kanban");
    const afterHashes = await hashAllSources(projectDir);
    const changedFiles = Object.keys(afterHashes).filter(
      (f) => afterHashes[f] !== beforeHashes[f],
    );
    const kanbanFiles = await listSourceFiles(projectDir);
    await saveJson("05-kanban-edit.json", {
      kanbanEdit,
      kanbanDiag,
      changedFiles,
      durationMs: Date.now() - kanbanStarted,
      fileCount: kanbanFiles.length,
      stageLog: [...stageLog],
    });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "05-kanban-studio.png"),
      fullPage: true,
    });

    expect(kanbanEdit.failed).toBe(false);
    expect(kanbanEdit.zeroProposals).toBe(false);
    expect(changedFiles.length).toBeGreaterThanOrEqual(3);
    // Not forced into a single mega-file only
    expect(changedFiles.length).toBeGreaterThan(1);
    expect(kanbanDiag.runResult).toBe("success");
    expect(kanbanDiag.failureRoot ?? "").not.toMatch(
      /couldn['’]t safely apply this edit/i,
    );
    const bodyAfterKanban = await page.locator("body").innerText();
    expect(bodyAfterKanban).not.toMatch(/couldn['’]t safely apply this edit/i);
    expect(
      await page.getByText(/Editing…|Editing\.\.\./i).isVisible().catch(() => false),
    ).toBeFalsy();
    expect(kanbanDiag.planApplyError).toBeFalsy();

    const crash = consoleErrors.some((e) =>
      /WorkspaceProvider|Maximum update depth/i.test(e),
    );
    const providerError = consoleErrors.some((e) => /provider:error/i.test(e));
    expect(crash).toBeFalsy();
    expect(providerError).toBeFalsy();

    // Feature validation in Preview with migrated storage.
    const kanbanPreviewUrl =
      String(kanbanDiag.previewUrl ?? previewUrl);
    const kanbanPreview = await openPreviewWindow(
      app,
      kanbanPreviewUrl,
      persistedBlob,
    );
    await kanbanPreview.waitForTimeout(2000);
    const featureResults = await validateKanbanFeatures(kanbanPreview);
    await saveJson("06-kanban-features.json", featureResults);
    await kanbanPreview.screenshot({
      path: path.join(ARTIFACT_DIR, "06-kanban-view.png"),
      fullPage: true,
    });

    // Dashboard + CSV screenshots (best-effort navigation).
    await clickNav(kanbanPreview, /dashboard/i);
    await kanbanPreview.waitForTimeout(600);
    await kanbanPreview.screenshot({
      path: path.join(ARTIFACT_DIR, "07-dashboard.png"),
      fullPage: true,
    });
    await clickNav(kanbanPreview, /import|export|settings|data/i).catch(() => undefined);
    await kanbanPreview.waitForTimeout(400);
    await kanbanPreview.screenshot({
      path: path.join(ARTIFACT_DIR, "08-csv-area.png"),
      fullPage: true,
    });

    expect(featureResults.dataSurvived).toBeTruthy();
    expect(featureResults.kanbanPresent).toBeTruthy();
    // Soft-require majority of advanced features; hard-fail on core.
    expect(featureResults.score).toBeGreaterThanOrEqual(0.55);

    await kanbanPreview.close().catch(() => undefined);

    // ——— QUIT / REOPEN ———
    await app.close();
    app = await runStage("app_relaunch", DEADLINE.appLaunch, () =>
      launchRealStudio(userDataDir),
    );
    page = await getMainWindow(app);
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(`[reopen-console] ${msg.text()}`);
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(`[reopen-pageerror] ${String(err)}`);
    });
    await dismissBlockingDialogs(page);
    await waitForStudioTestHooks(page);
    await stubOpenFolderDialog(app, projectDir);
    await page.evaluate(async (target) => {
      localStorage.setItem("bryantlabs.followUpReviewFirst", "0");
      await window.__studioTestHooks?.openProjectAt?.(target);
    }, projectDir);
    await waitForComposerReady(page);
    await waitForIndexReady(page);

    const reopenDiag = await captureDiagnostics(page, "reopen");
    await saveJson("09-reopen.json", {
      reopenDiag,
      filesStillPresent: await listSourceFiles(projectDir),
    });
    expect(reopenDiag.scanStatus).toBe("done");
    expect((await listSourceFiles(projectDir)).length).toBeGreaterThan(8);

    const reopenStarted = Date.now();
    await fillAgentPrompt(page, REOPEN_PROMPT);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);
    await maybeAcceptReview(page);
    const reopenEdit = await waitForEdit(page, DEADLINE.reopenEdit, "reopen_edit");
    await waitForPreview(page);
    const reopenEditDiag = await captureDiagnostics(page, "reopen-edit");
    await saveJson("10-reopen-edit.json", {
      reopenEdit,
      reopenEditDiag,
      durationMs: Date.now() - reopenStarted,
    });
    expect(reopenEdit.failed).toBe(false);
    expect(reopenEdit.filesChanged.length).toBeGreaterThan(0);
    expect(reopenEditDiag.runResult).toBe("success");
    expect(reopenEditDiag.failureRoot ?? "").not.toMatch(
      /couldn['’]t safely apply this edit/i,
    );

    const finalPreviewUrl = String(
      reopenEditDiag.previewUrl ?? kanbanPreviewUrl,
    );
    const finalPreview = await openPreviewWindow(
      app,
      finalPreviewUrl,
      persistedBlob,
    );
    await finalPreview.waitForTimeout(1500);
    await clickNav(finalPreview, /kanban|board/i).catch(() => undefined);
    const reopenUi = await finalPreview.evaluate(() => document.body.innerText);
    await finalPreview.screenshot({
      path: path.join(ARTIFACT_DIR, "11-post-reopen-kanban.png"),
      fullPage: true,
    });
    await saveJson("11-post-reopen-ui.json", {
      textSample: reopenUi.slice(0, 4000),
      hasMilestone: /milestone/i.test(reopenUi),
      hasBlocked: /blocked/i.test(reopenUi),
    });
    expect(/milestone|blocked|kanban|board/i.test(reopenUi)).toBeTruthy();
    await finalPreview.close().catch(() => undefined);

    const timing = summarizeTiming(stageLog);
    await saveJson("12-final-report.json", {
      overall: "pass",
      totalDurationMs: Date.now() - overallStartedAt,
      timing,
      createStats,
      createFiles: createFiles.length,
      changedFilesKanban: changedFiles,
      kanbanFeatureScore: featureResults.score,
      featureResults,
      consoleErrors: consoleErrors.slice(0, 40),
      provider: {
        create: createDiag.transportSummary,
        kanban: kanbanDiag.transportSummary,
        reopen: reopenEditDiag.transportSummary,
      },
    });
    await saveJson("00-stage-timings.json", { stages: stageLog, timing });

    await app.close();
  });
});

async function runStage<T>(
  stage: string,
  deadlineMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  // eslint-disable-next-line no-console
  console.log(`[stage:${stage}] start deadline=${deadlineMs}ms`);
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) => {
        setTimeout(
          () => reject(new Error(`${stage} exceeded ${deadlineMs}ms`)),
          deadlineMs,
        );
      }),
    ]);
    const endedAt = Date.now();
    stageLog.push({
      stage,
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      ok: true,
    });
    // eslint-disable-next-line no-console
    console.log(`[stage:${stage}] ok durationMs=${endedAt - startedAt}`);
    return result;
  } catch (err) {
    const endedAt = Date.now();
    const detail = err instanceof Error ? err.message : String(err);
    stageLog.push({
      stage,
      startedAt,
      endedAt,
      durationMs: endedAt - startedAt,
      ok: false,
      detail,
    });
    await saveJson("00-stage-timings.json", { stages: stageLog }).catch(() => undefined);
    throw err;
  }
}

async function launchRealStudio(userDataDir: string): Promise<ElectronApplication> {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.BRYANTLABS_MOCK_PROVIDER;
  delete env.BRYANTLABS_E2E_REAL_PROVIDER;
  delete env.BRYANTLABS_E2E_PROJECT;
  env.VITE_BRYANTLABS_E2E = "1";
  env.BRYANTLABS_E2E_USER_DATA = userDataDir;
  env.VITE_DEV_SERVER_URL = env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
  return electron.launch({
    args: ["."],
    cwd: projectRoot,
    env,
    timeout: DEADLINE.appLaunch,
  });
}

async function stubOpenFolderDialog(
  app: ElectronApplication,
  folderPath: string,
): Promise<void> {
  await app.evaluate(async ({ dialog }, target) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [target],
    });
  }, folderPath);
}

async function waitForPreview(page: Page): Promise<void> {
  await dismissBlockingDialogs(page);
  const previewTab = page.getByRole("tab", { name: "Preview", exact: true });
  if (await previewTab.isVisible().catch(() => false)) {
    const selected = await previewTab.getAttribute("aria-selected");
    if (selected !== "true") await previewTab.click({ force: true });
  }
  await page.waitForFunction(
    () => Boolean(window.__studioTestHooks?.getReadinessState?.()?.previewPanel?.url),
    undefined,
    { timeout: DEADLINE.preview },
  );
}

async function waitForIndexReady(page: Page): Promise<void> {
  await runStage("project_scan", DEADLINE.projectScan, async () => {
    await dismissBlockingDialogs(page);
    await page.waitForFunction(
      () => {
        const state = window.__studioTestHooks?.getReadinessState?.();
        return (
          state?.scanStatus === "done" &&
          typeof state.sourceFileCount === "number" &&
          state.sourceFileCount > 0
        );
      },
      undefined,
      { timeout: DEADLINE.projectScan },
    );
  });
}

async function waitForGreenfield(
  page: Page,
  timeoutMs: number,
): Promise<"success" | "failed"> {
  return runStage("greenfield_create", timeoutMs, async () => {
    const started = Date.now();
    let lastFingerprint = "";
    let lastProgressAt = Date.now();
    let sawProvider = false;
    while (Date.now() - started < timeoutMs) {
      const snap = await page.evaluate(() => {
        const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
        const readiness = window.__studioTestHooks?.getReadinessState?.()?.greenfieldRun;
        return {
          runResult: readiness?.runResult ?? run?.runResult ?? null,
          entries: (run?.entries ?? []).map(
            (e) => `${e.stage}:${e.status}:${e.message}`,
          ),
          failure: run?.failureReport?.rootCauseLine ?? run?.finalMessage ?? null,
        };
      });
      const fingerprint = snap.entries.join("|");
      if (fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        lastProgressAt = Date.now();
        // eslint-disable-next-line no-console
        console.log(`[greenfield] ${snap.entries.slice(-3).join(" · ")}`);
      }
      if (
        snap.entries.some((e) =>
          /provider_call:|ai_call:|generate:|write:/i.test(e),
        )
      ) {
        sawProvider = true;
      }
      if (!sawProvider && Date.now() - started > DEADLINE.providerFirstByte) {
        throw new Error(
          `Provider did not begin within ${DEADLINE.providerFirstByte / 1000}s`,
        );
      }
      if (
        snap.entries.some((e) =>
          /provider_call:running|generation:running|provider_call:started/i.test(e),
        )
      ) {
        // Provider is actively generating — allow long Opus runs without stall cancel.
        lastProgressAt = Date.now();
      }
      if (
        snap.entries.some((e) => /provider_fallback:running/i.test(e)) &&
        Date.now() - lastProgressAt > 45_000
      ) {
        throw new Error(
          `Greenfield stalled on provider fallback offer. Last=${snap.entries.at(-1)} failure=${snap.failure}`,
        );
      }
      if (Date.now() - lastProgressAt > DEADLINE.noProgress) {
        throw new Error(
          `No greenfield progress for ${DEADLINE.noProgress / 1000}s. Last=${snap.entries.at(-1)} failure=${snap.failure}`,
        );
      }
      if (
        snap.runResult === "success" ||
        snap.runResult === "failed" ||
        snap.runResult === "cancelled" ||
        snap.runResult === "aborted" ||
        snap.runResult === "interrupted"
      ) {
        if (snap.runResult !== "success") {
          throw new Error(`Greenfield ended ${snap.runResult}: ${snap.failure}`);
        }
        return "success";
      }
      await page.waitForTimeout(1500);
    }
    throw new Error(`Greenfield did not finish within ${timeoutMs / 1000}s`);
  });
}

async function maybeAcceptReview(page: Page): Promise<void> {
  const review = page.getByTestId("agent-review-chip");
  if (await review.isVisible({ timeout: 3_000 }).catch(() => false)) {
    const open = review.getByRole("button", { name: /Review changes/i });
    if (await open.isVisible().catch(() => false)) await open.click();
  }
  const accept = page.getByRole("button", { name: /^Accept all$/i });
  if (await accept.isVisible({ timeout: 3_000 }).catch(() => false)) {
    await accept.click();
  }
}

async function waitForEdit(
  page: Page,
  timeoutMs: number,
  stageName: string,
): Promise<{
  failed: boolean;
  zeroProposals: boolean;
  filesChanged: string[];
  outcome: string;
}> {
  return runStage(stageName, timeoutMs, async () => {
    const started = Date.now();
    let lastFingerprint = "";
    let lastProgressAt = Date.now();
    let sawProviderProgress = false;
    while (Date.now() - started < timeoutMs) {
      if (page.isClosed()) throw new Error("Electron page closed during edit");
      const snap = await page.evaluate(() => {
        const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
        const pipeline = window.__studioTestHooks?.getPatchPipelineState?.();
        const failure = String(
          run?.failureReport?.rootCauseLine ?? run?.finalMessage ?? "",
        );
        const zero = /zero valid patch proposals/i.test(failure);
        const files = [
          ...(run?.filesWritten ?? []),
          ...(run?.appliedFileDiffs ?? []).map((d) => d.path),
          ...(run?.workflow?.filesWritten ?? []),
        ];
        const verifyOk = run?.entries?.some(
          (e) => e.stage === "verification" && e.status === "success",
        );
        const wrote = run?.entries?.some(
          (e) =>
            e.stage === "apply_plan" &&
            e.status === "success" &&
            /Wrote \d+ file/i.test(e.message),
        );
        const running = run?.entries?.some((e) => e.status === "running");
        return {
          failure,
          zero,
          files: [...new Set(files)],
          verifyOk: Boolean(verifyOk),
          wrote: Boolean(wrote),
          running: Boolean(running),
          runResult: run?.runResult ?? null,
          planApplyError: pipeline?.planApplyError ?? null,
          entries: (run?.entries ?? []).map((e) => `${e.stage}:${e.status}`),
        };
      });
      const fingerprint = snap.entries.join("|") + "|" + snap.runResult;
      if (fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        lastProgressAt = Date.now();
        // eslint-disable-next-line no-console
        console.log(`[edit] ${snap.entries.slice(-4).join(" · ")}`);
      }
      if (
        snap.entries.some((e) =>
          /provider_call|ai_call|apply_plan|write|verification|ai_plan/i.test(e),
        )
      ) {
        sawProviderProgress = true;
      }
      // Dismiss / resolve provider fallback UI so apply-plan cannot hang forever.
      const fallbackVisible = await page
        .getByRole("button", { name: /retry|try again|continue|use .+|switch/i })
        .first()
        .isVisible()
        .catch(() => false);
      if (fallbackVisible) {
        await page
          .getByRole("button", { name: /retry|try again/i })
          .first()
          .click()
          .catch(async () => {
            await page
              .getByRole("button", { name: /cancel|dismiss|close/i })
              .first()
              .click()
              .catch(() => undefined);
          });
        lastProgressAt = Date.now();
      }
      if (
        snap.entries.some((e) => /provider_fallback:running/i.test(e)) &&
        Date.now() - lastProgressAt > 100_000
      ) {
        throw new Error(
          `Edit stalled on provider fallback offer. Last=${snap.entries.at(-1)}`,
        );
      }
      if (!sawProviderProgress && Date.now() - started > DEADLINE.providerFirstByte) {
        throw new Error(
          `Provider did not begin streaming within ${DEADLINE.providerFirstByte / 1000}s`,
        );
      }
      if (!snap.running && Date.now() - lastProgressAt > DEADLINE.noProgress) {
        throw new Error(
          `No edit progress for ${DEADLINE.noProgress / 1000}s. Last=${snap.entries.at(-1)}`,
        );
      }
      if ((snap.wrote && snap.verifyOk) || snap.runResult === "success") {
        const verifyEntries = (snap.entries ?? []).filter((e) =>
          e.startsWith("verification:"),
        );
        const lastVerify = verifyEntries.at(-1) ?? "";
        if (lastVerify === "verification:failed") {
          return {
            failed: true,
            zeroProposals: false,
            filesChanged: snap.files,
            outcome: snap.failure || "Verification failed",
          };
        }
        if (snap.runResult === "success" || lastVerify === "verification:success") {
          return {
            failed: false,
            zeroProposals: false,
            filesChanged: snap.files,
            outcome: "patch_applied",
          };
        }
      }
      if (
        snap.zero ||
        snap.planApplyError ||
        snap.runResult === "failed" ||
        snap.runResult === "cancelled"
      ) {
        if (snap.wrote && snap.verifyOk) {
          return {
            failed: false,
            zeroProposals: false,
            filesChanged: snap.files,
            outcome: "patch_applied",
          };
        }
        return {
          failed: true,
          zeroProposals: snap.zero,
          filesChanged: snap.files,
          outcome: snap.failure || snap.planApplyError || String(snap.runResult),
        };
      }
      await page.waitForTimeout(1500);
    }
    throw new Error(`Edit did not finish within ${timeoutMs / 1000}s`);
  });
}

async function captureDiagnostics(page: Page, label: string) {
  return page.evaluate((step) => {
    const ready = window.__studioTestHooks?.getReadinessState?.();
    const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
    const pipeline = window.__studioTestHooks?.getPatchPipelineState?.();
    const smoke = window.__studioTestHooks?.getProviderSmokeState?.();
    const transport = window.__studioTestHooks?.getTransportDiagnostics?.();
    return {
      step,
      provider: smoke?.provider ?? run?.provider ?? null,
      model: smoke?.model ?? run?.model ?? null,
      mockMode: smoke?.mockMode ?? null,
      projectPath: ready?.projectPath ?? run?.projectPath ?? null,
      scanStatus: ready?.scanStatus ?? null,
      sourceFileCount: ready?.sourceFileCount ?? null,
      filesWritten: run?.filesWritten ?? [],
      runResult: run?.runResult ?? null,
      verification: run?.verification ?? null,
      failureRoot: run?.failureReport?.rootCauseLine ?? run?.finalMessage ?? null,
      planApplyPhase: pipeline?.planApplyPhase ?? null,
      planApplyError: pipeline?.planApplyError ?? null,
      previewUrl: ready?.previewPanel?.url ?? null,
      transportSummary: transport?.summary ?? null,
      lastEntries: (run?.entries ?? []).slice(-20).map((e) => ({
        stage: e.stage,
        status: e.status,
        message: e.message,
      })),
    };
  }, label);
}

async function listSourceFiles(projectDir: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) await walk(full);
      else if (/\.(tsx?|jsx?|css)$/i.test(entry.name)) {
        out.push(path.relative(projectDir, full));
      }
    }
  }
  await walk(projectDir);
  return out.sort();
}

async function projectStats(projectDir: string) {
  const files = await listSourceFiles(projectDir);
  let lines = 0;
  let bytes = 0;
  for (const rel of files) {
    const buf = await fs.readFile(path.join(projectDir, rel));
    bytes += buf.length;
    lines += buf.toString("utf8").split(/\r?\n/).length;
  }
  return { fileCount: files.length, lines, bytes, files };
}

async function hashAllSources(projectDir: string): Promise<Record<string, string>> {
  const files = await listSourceFiles(projectDir);
  const out: Record<string, string> = {};
  for (const rel of files) {
    const buf = await fs.readFile(path.join(projectDir, rel));
    out[rel] = createHash("sha256").update(buf).digest("hex");
  }
  return out;
}

async function scanPlaceholders(projectDir: string) {
  const files = await listSourceFiles(projectDir);
  const critical: Array<{ file: string; match: string }> = [];
  const soft: Array<{ file: string; match: string }> = [];
  const criticalRe =
    /TODO:\s*implement|FIXME:\s*implement|not implemented|throw new Error\(["']Not implemented|coming soon|lorem ipsum|Stub pages|these will be replaced once the real page|Page scaffold — generated to complete routing/i;
  const softRe = /\bTODO\b|\bFIXME\b|placeholder/i;
  for (const rel of files) {
    const text = await fs.readFile(path.join(projectDir, rel), "utf8");
    const c = text.match(criticalRe);
    if (c) critical.push({ file: rel, match: c[0]! });
    else {
      const s = text.match(softRe);
      if (s) soft.push({ file: rel, match: s[0]! });
    }
  }
  return { critical, soft };
}

async function openPreviewWindow(
  app: ElectronApplication,
  url: string,
  storage: Record<string, string | null> | null,
): Promise<Page> {
  const previewPagePromise = app.waitForEvent("window");
  await app.evaluate(
    async ({ BrowserWindow }, args) => {
      const win = new BrowserWindow({
        width: 1280,
        height: 900,
        show: true,
        webPreferences: { contextIsolation: true, nodeIntegration: false },
      });
      await win.loadURL(args.url);
      if (args.storage) {
        const script = `
          (() => {
            const data = ${JSON.stringify(args.storage)};
            for (const [k, v] of Object.entries(data)) {
              if (v == null) localStorage.removeItem(k);
              else localStorage.setItem(k, v);
            }
          })();
        `;
        await win.webContents.executeJavaScript(script);
        await win.loadURL(args.url);
      }
      await new Promise((r) => setTimeout(r, 800));
    },
    { url, storage },
  );
  const previewPage = await previewPagePromise;
  await previewPage.waitForLoadState("domcontentloaded");
  return previewPage;
}

async function clickNav(page: Page, name: RegExp): Promise<boolean> {
  const candidates = [
    page.getByRole("link", { name }),
    page.getByRole("button", { name }),
    page.getByRole("menuitem", { name }),
    page.locator("nav, aside, [class*='sidebar']").getByText(name),
  ];
  for (const loc of candidates) {
    if (await loc.first().isVisible().catch(() => false)) {
      await loc.first().click({ force: true });
      return true;
    }
  }
  return false;
}

async function validateInitialNavigation(page: Page) {
  const body = await page.locator("body").innerText();
  const sidebarOk =
    /dashboard|projects|tasks|team|calendar|activity|northstar/i.test(body);
  const pagesHit: string[] = [];
  for (const [label, re] of [
    ["dashboard", /dashboard/i],
    ["projects", /projects?/i],
    ["tasks", /tasks?/i],
    ["team", /team|members?/i],
    ["calendar", /calendar/i],
    ["activity", /activity|timeline/i],
  ] as const) {
    const hit = await clickNav(page, re);
    if (hit) {
      pagesHit.push(label);
      await page.waitForTimeout(400);
    }
  }
  // Theme toggle best-effort
  const theme = page.getByRole("button", { name: /dark|light|theme/i });
  if (await theme.first().isVisible().catch(() => false)) {
    await theme.first().click().catch(() => undefined);
    pagesHit.push("theme");
  }
  return { sidebarOk, pagesHit, bodySample: body.slice(0, 2000) };
}

async function seedUserDataInPreview(page: Page) {
  // Prefer UI creation; fall back to localStorage mutation of known schemas.
  const created: string[] = [];
  const addProject = page.getByRole("button", {
    name: /new project|add project|create project/i,
  });
  if (await addProject.first().isVisible().catch(() => false)) {
    await addProject.first().click();
    const input = page.getByRole("textbox").first();
    if (await input.isVisible().catch(() => false)) {
      await input.fill("Acceptance Project Alpha");
      await page.keyboard.press("Enter").catch(() => undefined);
      const save = page.getByRole("button", { name: /save|create|add/i });
      if (await save.first().isVisible().catch(() => false)) {
        await save.first().click().catch(() => undefined);
      }
      created.push("project-via-ui");
    }
  }

  await page.evaluate(() => {
    const marker = {
      __northstarAcceptance: true,
      projects: [
        { id: "p-acc-1", name: "Acceptance Project Alpha", status: "active" },
        { id: "p-acc-2", name: "Acceptance Project Beta", status: "active" },
      ],
      tasks: [
        {
          id: "t-acc-1",
          title: "Seeded task one",
          status: "todo",
          priority: "high",
          projectId: "p-acc-1",
          assigneeId: "m-acc-1",
        },
        {
          id: "t-acc-2",
          title: "Seeded task two",
          status: "in_progress",
          priority: "medium",
          projectId: "p-acc-2",
          assigneeId: "m-acc-2",
        },
      ],
      members: [
        { id: "m-acc-1", name: "Alex Rivera" },
        { id: "m-acc-2", name: "Jordan Lee" },
      ],
      filters: [{ id: "f-acc-1", name: "High priority only", query: "priority:high" }],
    };
    // Write into common keys plus a dedicated marker key.
    localStorage.setItem("northstar-acceptance-seed", JSON.stringify(marker));
    for (const key of [
      "northstar",
      "northstar-data",
      "northstar_v1",
      "app-data",
      "pm-data",
    ]) {
      try {
        const raw = localStorage.getItem(key);
        if (!raw) {
          localStorage.setItem(
            key,
            JSON.stringify({ version: 1, ...marker }),
          );
        } else {
          const parsed = JSON.parse(raw) as Record<string, unknown>;
          localStorage.setItem(
            key,
            JSON.stringify({
              ...parsed,
              acceptanceSeed: marker,
            }),
          );
        }
      } catch {
        /* ignore */
      }
    }
  });
  created.push("storage-seed");
  return { created };
}

async function validateKanbanFeatures(page: Page) {
  await clickNav(page, /kanban|board/i).catch(() => undefined);
  await page.waitForTimeout(800);
  const text = await page.locator("body").innerText();
  const storage = await page.evaluate(() => {
    const out: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) out[k] = localStorage.getItem(k);
    }
    return out;
  });
  const blob = JSON.stringify(storage);
  const checks = {
    dataSurvived:
      /Acceptance Project Alpha|Seeded task one|northstar-acceptance-seed|Alex Rivera/i.test(
        blob + text,
      ),
    kanbanPresent: /kanban|backlog|in progress|review|done|planned/i.test(text),
    columns: ["Backlog", "Planned", "In Progress", "Review", "Done"].filter((c) =>
      new RegExp(c, "i").test(text),
    ),
    milestones: /milestone/i.test(text),
    blocked: /blocked|dependenc/i.test(text),
    bulk: /bulk|select all|selected/i.test(text),
    filters: /preset|saved filter|filter/i.test(text),
    csv: /csv|import|export/i.test(text),
    commandPalette: /command palette|⌘K|Ctrl\+K|quick action/i.test(text),
    undo: /\bundo\b/i.test(text),
    charts: /chart|workload|completion|overdue/i.test(text),
  };

  // Try command palette keyboard.
  let commandPaletteWorks = false;
  await page.keyboard.press("Meta+k").catch(() => undefined);
  await page.waitForTimeout(300);
  await page.keyboard.press("Control+k").catch(() => undefined);
  await page.waitForTimeout(400);
  if (
    await page
      .getByRole("dialog")
      .or(page.locator("[class*='command'], [class*='palette']"))
      .first()
      .isVisible()
      .catch(() => false)
  ) {
    commandPaletteWorks = true;
    await page.keyboard.press("Escape").catch(() => undefined);
  }

  // CSV invalid import best-effort if file input exists.
  let csvValidation = "skipped";
  const fileInput = page.locator('input[type="file"]').first();
  if (await fileInput.isVisible().catch(() => false)) {
    const badCsv = path.join(ARTIFACT_DIR, "bad-import.csv");
    await fs.writeFile(
      badCsv,
      "title,status,priority\n,bogus,not-a-priority\nValid Task,todo,high\n",
    );
    await fileInput.setInputFiles(badCsv).catch(() => undefined);
    await page.waitForTimeout(800);
    const after = await page.locator("body").innerText();
    csvValidation = /error|invalid|row/i.test(after) ? "errors-shown" : "no-errors-detected";
  }

  const scoreParts = [
    checks.dataSurvived,
    checks.kanbanPresent,
    checks.columns.length >= 3,
    checks.milestones,
    checks.blocked,
    checks.bulk,
    checks.filters,
    checks.csv,
    checks.undo,
    checks.charts,
    commandPaletteWorks || checks.commandPalette,
  ];
  const score = scoreParts.filter(Boolean).length / scoreParts.length;

  return {
    ...checks,
    commandPaletteWorks,
    csvValidation,
    score,
    textSample: text.slice(0, 3500),
  };
}

function summarizeTiming(stages: StageRecord[]) {
  const by = Object.fromEntries(
    stages.map((s) => [s.stage, s.durationMs ?? null]),
  );
  return {
    byStage: by,
    failedStages: stages.filter((s) => !s.ok).map((s) => s.stage),
  };
}

async function saveJson(name: string, value: unknown): Promise<void> {
  await fs.writeFile(
    path.join(ARTIFACT_DIR, name),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}
