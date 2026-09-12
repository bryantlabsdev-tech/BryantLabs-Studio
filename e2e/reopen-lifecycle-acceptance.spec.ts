import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  closeStudioApp,
  dismissBlockingDialogs,
  fillAgentPrompt,
  getMainWindow,
  projectRoot,
  sendAgentPrompt,
  trackRootPid,
  waitForComposerReady,
  waitForStudioTestHooks,
} from "./helpers/studio";

const ACCEPTANCE_REAL = process.env.BRYANTLABS_ACCEPTANCE_REAL === "1";
const ARTIFACT_DIR = path.join(projectRoot, "e2e/test-results/acceptance-real");
const REAL_USER_DATA = path.join(
  os.homedir(),
  "Library/Application Support/bryantlabs-studio",
);
const CREATE_PROMPT =
  "Create a task manager with add, edit, complete, delete, filters, and local persistence.";
const EDIT_BEFORE_QUIT = "Add priority levels and due dates to tasks.";
const EDIT_AFTER_REOPEN =
  "Add overdue-task highlighting and a filter for high-priority tasks.";
const EDIT_AFTER_SECOND_REOPEN =
  "Add a completed-tasks count badge to the header.";

/** Hard stage ceilings — never silently wait past these. */
const DEADLINE = {
  appLaunch: 30_000,
  projectScan: 60_000,
  providerFirstByte: 60_000,
  aiEdit: 180_000,
  createOverall: 10 * 60_000,
  patchApply: 30_000,
  preview: 60_000,
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

test.describe("Real-provider reopen lifecycle acceptance", () => {
  test.skip(
    !ACCEPTANCE_REAL,
    "Set BRYANTLABS_ACCEPTANCE_REAL=1 to run the real-provider lifecycle acceptance.",
  );

  test.setTimeout(20 * 60_000);

  let app: ElectronApplication | undefined;
  test.afterAll(async () => {
    await closeStudioApp(app);
  });

  test("create, edit, quit/reopen, edit with stage deadlines", async () => {
    expect(projectRoot).toBe("/Users/ferrisb/Desktop/Bryantlabs Studio FIXED");
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });
    const projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "bryantlabs-task-manager-"));
    const userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "bryantlabs-acceptance-user-"));
    await fs.copyFile(
      path.join(REAL_USER_DATA, "provider-settings.json"),
      path.join(userDataDir, "provider-settings.json"),
    );

    // Failed-stage first: provider must respond within 60s (health).
    app = await runStage("app_launch", DEADLINE.appLaunch, async () => {
      const launched = await launchRealStudio(userDataDir);
      return launched;
    });
    let page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await waitForStudioTestHooks(page);

    await runStage("provider_health", DEADLINE.providerFirstByte, async () => {
      const smoke = await page.evaluate(() =>
        window.__studioTestHooks?.getProviderSmokeState?.(),
      );
      expect(smoke?.mockMode).toBe(false);
      expect(smoke?.provider).toBe("anthropic");
      const health = await page.evaluate(async () =>
        window.__studioTestHooks?.checkConfiguredProviderHealth?.(),
      );
      if (!health?.ok) {
        throw new Error(
          `Provider health failed: ${JSON.stringify(health)} — refill Anthropic credits or fix credentials.`,
        );
      }
      return health;
    });

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
    await fillAgentPrompt(page, CREATE_PROMPT);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);

    const createOutcome = await waitForGreenfield(page, DEADLINE.createOverall);
    await waitForPreview(page);
    const createDiag = await captureDiagnostics(page, "create");
    await saveJson("01-create.json", { projectDir, createOutcome, ...createDiag, stageLog: [...stageLog] });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "01-create-preview.png"),
      fullPage: true,
    });
    expect(createOutcome).toBe("success");
    expect(createDiag.previewUrl).toBeTruthy();
    expect((await listSourceFiles(projectDir)).length).toBeGreaterThan(0);

    await waitForComposerReady(page);
    await fillAgentPrompt(page, EDIT_BEFORE_QUIT);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);
    await maybeAcceptReview(page);
    const edit1 = await waitForEdit(page, DEADLINE.aiEdit, "edit_before_quit");
    await waitForPreview(page);
    const edit1Diag = await captureDiagnostics(page, "edit1-before-quit");
    await saveJson("02-edit-before-quit.json", { ...edit1, ...edit1Diag });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "02-edit-before-quit.png"),
      fullPage: true,
    });
    expect(edit1.zeroProposals).toBe(false);
    expect(edit1.failed).toBe(false);
    expect(edit1.filesChanged.length).toBeGreaterThan(0);
    expect(edit1Diag.previewUrl).toBeTruthy();
    await dismissBlockingDialogs(page);

    await closeStudioApp(app);

    app = await runStage("app_relaunch", DEADLINE.appLaunch, async () =>
      launchRealStudio(userDataDir),
    );
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await waitForStudioTestHooks(page);
    await stubOpenFolderDialog(app, projectDir);
    await page.evaluate(async (target) => {
      localStorage.setItem("bryantlabs.followUpReviewFirst", "0");
      await window.__studioTestHooks?.openProjectAt?.(target);
    }, projectDir);
    await waitForComposerReady(page);
    await waitForIndexReady(page);

    const reopenBefore = await captureDiagnostics(page, "reopen-before-edit");
    await saveJson("03-reopen-before-edit.json", reopenBefore);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "03-reopen-before-edit.png"),
      fullPage: true,
    });
    expect(reopenBefore.scanStatus).toBe("done");
    expect(reopenBefore.indexedSourceFiles).toBeGreaterThan(0);

    await fillAgentPrompt(page, EDIT_AFTER_REOPEN);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);
    await maybeAcceptReview(page);
    const edit2 = await waitForEdit(page, DEADLINE.aiEdit, "edit_after_reopen");
    await waitForPreview(page);
    const edit2Diag = await captureDiagnostics(page, "edit2-after-reopen");
    await saveJson("04-edit-after-reopen.json", { ...edit2, ...edit2Diag });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "04-edit-after-reopen.png"),
      fullPage: true,
    });
    expect(edit2.zeroProposals).toBe(false);
    expect(edit2.failed).toBe(false);
    expect(edit2.filesChanged.some((f) => /\.(tsx|css)$/i.test(f))).toBe(true);
    expect(edit2Diag.previewUrl).toBeTruthy();

    // Capture transport BEFORE opening Diagnostics (events must already be buffered).
    const transportBeforeTab = await page.evaluate(() =>
      window.__studioTestHooks?.getTransportDiagnostics?.(),
    );
    await saveJson("05-transport-before-diagnostics-tab.json", transportBeforeTab);
    expect((transportBeforeTab?.events ?? []).length).toBeGreaterThan(0);

    await openPipelineDiagnostics(page);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "05-pipeline-diagnostics-transport.png"),
      fullPage: true,
    });

    await closeStudioApp(app);

    // Second complete quit/reopen → third edit
    app = await runStage("app_relaunch_2", DEADLINE.appLaunch, async () =>
      launchRealStudio(userDataDir),
    );
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await waitForStudioTestHooks(page);
    await stubOpenFolderDialog(app, projectDir);
    await page.evaluate(async (target) => {
      localStorage.setItem("bryantlabs.followUpReviewFirst", "0");
      await window.__studioTestHooks?.openProjectAt?.(target);
    }, projectDir);
    await waitForComposerReady(page);
    await waitForIndexReady(page);

    const reopen2Before = await captureDiagnostics(page, "reopen2-before-edit");
    await saveJson("06-reopen2-before-edit.json", reopen2Before);
    expect(reopen2Before.scanStatus).toBe("done");

    await fillAgentPrompt(page, EDIT_AFTER_SECOND_REOPEN);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);
    await maybeAcceptReview(page);
    const edit3 = await waitForEdit(page, DEADLINE.aiEdit, "edit_after_second_reopen");
    await waitForPreview(page);
    const edit3Diag = await captureDiagnostics(page, "edit3-after-second-reopen");
    await saveJson("07-edit-after-second-reopen.json", { ...edit3, ...edit3Diag });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "07-edit-after-second-reopen.png"),
      fullPage: true,
    });
    expect(edit3.zeroProposals).toBe(false);
    expect(edit3.failed).toBe(false);
    expect(edit3Diag.previewUrl).toBeTruthy();

    await openPipelineDiagnostics(page);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "08-pipeline-diagnostics-after-edit3.png"),
      fullPage: true,
    });

    await saveJson("00-stage-timings.json", { projectDir, stages: stageLog });
    await closeStudioApp(app);
  });
});

async function openPipelineDiagnostics(page: Page): Promise<void> {
  // Pipeline Diagnostics lives in the overflow "More" menu, not the primary tabs.
  const more = page.getByRole("tab", { name: /More/i }).first();
  await more.click();
  const item = page.getByRole("menuitem", { name: /Pipeline Diagnostics/i });
  await item.waitFor({ state: "visible", timeout: 10_000 });
  await item.click();
  await page.waitForSelector('[data-testid="pipeline-inspector"], .pipeline-inspector__transport', {
    timeout: 15_000,
  });
  // Settle any live transport updates before screenshot.
  await page.waitForTimeout(500);
}

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
  if (process.env.PLAYWRIGHT_USE_DIST === "1") {
    delete env.VITE_DEV_SERVER_URL;
  } else {
    env.VITE_DEV_SERVER_URL = env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
  }
  const app = await electron.launch({
    args: ["."],
    cwd: projectRoot,
    env,
    timeout: DEADLINE.appLaunch,
  });
  trackRootPid(app.process()?.pid);
  return app;
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
    if (selected !== "true") {
      await previewTab.click({ force: true });
    }
  }
  await page.waitForFunction(
    () => Boolean(window.__studioTestHooks?.getReadinessState?.()?.previewPanel?.url),
    undefined,
    { timeout: DEADLINE.preview },
  );
}

async function waitForGreenfield(
  page: Page,
  timeoutMs: number,
): Promise<"success" | "failed"> {
  return runStage("greenfield_create", timeoutMs, async () => {
    const started = Date.now();
    let lastFingerprint = "";
    let lastProgressAt = Date.now();
    while (Date.now() - started < timeoutMs) {
      const snap = await page.evaluate(() => {
        const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
        const readiness = window.__studioTestHooks?.getReadinessState?.()?.greenfieldRun;
        return {
          runResult: readiness?.runResult ?? run?.runResult ?? null,
          entries: (run?.entries ?? []).map((e) => `${e.stage}:${e.status}:${e.message}`),
          failure: run?.failureReport?.rootCauseLine ?? run?.finalMessage ?? null,
        };
      });
      const fingerprint = snap.entries.join("|");
      if (fingerprint !== lastFingerprint) {
        lastFingerprint = fingerprint;
        lastProgressAt = Date.now();
        // eslint-disable-next-line no-console
        console.log(`[greenfield] progress entries=${snap.entries.slice(-3).join(" · ")}`);
      }
      if (Date.now() - lastProgressAt > 60_000) {
        throw new Error(
          `No greenfield progress for 60s. Last=${snap.entries.at(-1) ?? "none"} failure=${snap.failure ?? "none"}`,
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
          throw new Error(`Greenfield ended ${snap.runResult}: ${snap.failure ?? "unknown"}`);
        }
        return "success";
      }
      await page.waitForTimeout(1_000);
    }
    throw new Error(`Greenfield did not finish within ${timeoutMs / 1000}s`);
  });
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
    let providerCallSince: number | null = null;
    while (Date.now() - started < timeoutMs) {
      if (page.isClosed()) {
        throw new Error("Electron page closed during edit");
      }
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
        ];
        const verifyFailed = run?.entries?.some(
          (e) => e.stage === "verification" && e.status === "failed",
        );
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
          verifyFailed: Boolean(verifyFailed),
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
        console.log(`[edit] progress ${snap.entries.slice(-4).join(" · ")}`);
      }
      if (
        snap.entries.some((e) =>
          /provider_response:success|parser:success|apply_plan:(running|success)|write:(running|success)|verification:(running|success)|ai_plan:success|provider_call:(running|success)/.test(
            e,
          ),
        )
      ) {
        sawProviderProgress = true;
      }
      const providerCallRunning = snap.entries.some((e) => e === "provider_call:running");
      if (providerCallRunning && providerCallSince == null) {
        providerCallSince = Date.now();
      }
      if (!providerCallRunning) {
        providerCallSince = null;
      }
      if (!sawProviderProgress && Date.now() - started > DEADLINE.providerFirstByte) {
        throw new Error(
          `Provider did not begin streaming within ${DEADLINE.providerFirstByte / 1000}s. entries=${snap.entries.join(",")}`,
        );
      }
      if (
        providerCallSince != null &&
        Date.now() - providerCallSince > DEADLINE.aiEdit
      ) {
        throw new Error(
          `Provider call produced no completion within ${DEADLINE.aiEdit / 1000}s.`,
        );
      }
      if (!snap.running && !providerCallRunning && Date.now() - lastProgressAt > 60_000) {
        throw new Error(
          `No edit progress for 60s. Last=${snap.entries.at(-1) ?? "none"} failure=${snap.failure || "none"}`,
        );
      }

      if (
        (snap.wrote && snap.verifyOk) ||
        snap.runResult === "success"
      ) {
        return {
          failed: false,
          zeroProposals: false,
          filesChanged: snap.files,
          outcome: "patch_applied",
        };
      }
      if (
        snap.zero ||
        snap.verifyFailed ||
        snap.planApplyError ||
        (/did not begin responding|exceeded \d+s/i.test(snap.failure) &&
          snap.files.length === 0 &&
          !snap.wrote &&
          !snap.running)
      ) {
        return {
          failed: true,
          zeroProposals: snap.zero,
          filesChanged: snap.files,
          outcome: snap.failure || snap.planApplyError || "apply_failed",
        };
      }
      if (snap.runResult === "failed" || snap.runResult === "cancelled") {
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
          outcome: snap.failure || snap.runResult,
        };
      }
      await page.waitForTimeout(1_000);
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
    const indexLabel =
      document.querySelector(".index-status__label")?.textContent?.trim() ?? null;
    const indexMatch = indexLabel?.match(/Ready\s*[·-]\s*(\d+)\s*files/i);
    const sourceFiles =
      ready?.sourceFileCount ??
      run?.filesWritten?.filter((p) => /\.(tsx?|jsx?|css)$/i.test(p)).length ??
      0;
    return {
      step,
      provider: smoke?.provider ?? run?.provider ?? null,
      model: smoke?.model ?? run?.model ?? null,
      mockMode: smoke?.mockMode ?? null,
      projectPath: ready?.projectPath ?? run?.projectPath ?? null,
      scanStatus: ready?.scanStatus ?? null,
      indexLabel,
      indexedSourceFiles: Math.max(indexMatch ? Number(indexMatch[1]) : 0, sourceFiles),
      proposalCount:
        run?.appliedFileDiffs?.length ??
        run?.workflow?.filesAccepted ??
        run?.filesWritten?.length ??
        0,
      rejected: (run?.entries ?? [])
        .filter((e) => e.status === "failed" && /proposal|patch|apply_plan/i.test(e.stage))
        .map((e) => ({ stage: e.stage, message: e.message })),
      filesWritten: run?.filesWritten ?? [],
      appliedDiffs: (run?.appliedFileDiffs ?? []).map((d) => d.path),
      runResult: run?.runResult ?? null,
      verification: run?.verification ?? null,
      failureRoot: run?.failureReport?.rootCauseLine ?? run?.finalMessage ?? null,
      planApplyPhase: pipeline?.planApplyPhase ?? null,
      planApplyError: pipeline?.planApplyError ?? null,
      previewUrl: ready?.previewPanel.url ?? null,
      previewRunning: ready?.previewPanel.running ?? null,
      previewVisible: ready?.previewPanel.visible ?? null,
      transportSummary: transport?.summary ?? null,
      transportEvents: (transport?.events ?? []).map((e) => ({
        requestId: e.requestId,
        attempt: e.attempt,
        host: e.urlHost,
        payloadByteLength: e.payloadByteLength,
        bytesWritten: e.bytesWritten,
        contentLengthHeader: e.contentLengthHeader,
        httpStatus: e.httpStatus,
        responseByteLength: e.responseByteLength,
        truncationSource: e.truncationSource,
        parserStage: e.parserStage,
        bodyFullyFlushed: e.bodyFullyFlushed,
        aborted: e.aborted,
        abortReason: e.abortReason,
        providerRequestId: e.providerRequestId,
        durationMs: e.durationMs,
        socketEvents: e.socketEvents,
        completed: e.completed,
        localJsonParse: e.localJsonParse ?? null,
        topLevelKeys: e.topLevelKeys ?? null,
        fieldTypeMap: e.fieldTypeMap ?? null,
        messageCount: e.messageCount ?? null,
        contentBlockTypes: e.contentBlockTypes ?? null,
        toolCount: e.toolCount ?? null,
        schemaResult: e.schemaResult ?? null,
        serializer: e.serializer ?? null,
        hashBeforeValidation: e.hashBeforeValidation ?? null,
        hashBeforeSend: e.hashBeforeSend ?? null,
        hashAtSocketWrite: e.hashAtSocketWrite ?? null,
      })),
      lastEntries: (run?.entries ?? []).slice(-12).map((e) => ({
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
  return out;
}

async function saveJson(name: string, value: unknown): Promise<void> {
  await fs.writeFile(
    path.join(ARTIFACT_DIR, name),
    `${JSON.stringify(value, null, 2)}\n`,
  );
}
