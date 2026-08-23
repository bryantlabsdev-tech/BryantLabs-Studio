/**
 * Final quit/reopen acceptance: reopen task-manager, request clear-completed edit.
 * Gated by BRYANTLABS_ACCEPTANCE_REAL=1. No product feature changes.
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
  waitForPatchApplied,
  waitForStudioTestHooks,
} from "./helpers/studio";

const ACCEPTANCE_REAL = process.env.BRYANTLABS_ACCEPTANCE_REAL === "1";
const ARTIFACT_DIR = path.join(
  projectRoot,
  "e2e/test-results/acceptance-quit-reopen-clear",
);
const REAL_USER_DATA = path.join(
  os.homedir(),
  "Library/Application Support/bryantlabs-studio",
);
const PROJECT_PATH =
  process.env.BRYANTLABS_ACCEPTANCE_PROJECT ??
  "/var/folders/d7/281my_0x699cf3gqqf6ndvbm0000gn/T/bryantlabs-task-manager-8YOB4Y";
const EDIT_PROMPT =
  "Add a button to clear completed tasks with confirmation.";
const DEADLINE = {
  appLaunch: 30_000,
  aiEdit: 240_000,
} as const;

test.describe("Quit/reopen clear-completed acceptance", () => {
  test.skip(!ACCEPTANCE_REAL, "Set BRYANTLABS_ACCEPTANCE_REAL=1");
  test.setTimeout(10 * 60_000);

  test("quit, reopen project, apply clear-completed edit successfully", async () => {
    expect(projectRoot).toBe("/Users/ferrisb/Desktop/Bryantlabs Studio FIXED");
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });

    const appTsx = path.join(PROJECT_PATH, "src/App.tsx");
    const indexCss = path.join(PROJECT_PATH, "src/index.css");
    await fs.access(appTsx);
    const before = {
      App: await sha256File(appTsx),
      css: await sha256File(indexCss),
    };
    await saveJson("01-before-hashes.json", before);
    const beforeApp = await fs.readFile(appTsx, "utf8");
    expect(beforeApp).not.toMatch(/clearCompleted|Clear completed|clear completed/i);

    const userDataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "bryantlabs-quit-reopen-"),
    );
    await fs.copyFile(
      path.join(REAL_USER_DATA, "provider-settings.json"),
      path.join(userDataDir, "provider-settings.json"),
    );

    // 1) Launch, open project, then quit completely.
    let app = await launchRealStudio(userDataDir);
    let page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await waitForStudioTestHooks(page);
    await page.evaluate(async (target) => {
      localStorage.setItem("bryantlabs.followUpReviewFirst", "0");
      await window.__studioTestHooks?.openProjectAt?.(target);
    }, PROJECT_PATH);
    await waitForComposerReady(page);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "02-before-quit.png"),
      fullPage: true,
    });
    await app.close();

    // 2) Reopen Studio + same project.
    app = await launchRealStudio(userDataDir);
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await waitForStudioTestHooks(page);
    await page.evaluate(async (target) => {
      localStorage.setItem("bryantlabs.followUpReviewFirst", "0");
      await window.__studioTestHooks?.openProjectAt?.(target);
    }, PROJECT_PATH);
    await waitForComposerReady(page);
    await page.waitForFunction(
      () => {
        const state = window.__studioTestHooks?.getReadinessState?.();
        return state?.scanStatus === "done" && (state.sourceFileCount ?? 0) > 0;
      },
      undefined,
      { timeout: 60_000 },
    );
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "03-after-reopen.png"),
      fullPage: true,
    });

    // 3) Real-provider edit.
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => {
      consoleErrors.push(String(err));
    });

    await fillAgentPrompt(page, EDIT_PROMPT);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);
    await maybeAcceptReview(page);

    const applyOutcome = await waitForPatchApplied(page);
    expect(applyOutcome).toBe("patch_applied");
    await page.waitForTimeout(3_000);

    const snapshot = await page.evaluate(() => {
      const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
      const pipeline = window.__studioTestHooks?.getPatchPipelineState?.();
      const readiness = window.__studioTestHooks?.getReadinessState?.();
      const transport = window.__studioTestHooks?.getTransportDiagnostics?.();
      return { run, pipeline, readiness, transport };
    });
    await saveJson("04-run-snapshot.json", snapshot);

    const run = snapshot.run as {
      runResult?: string;
      finalMessage?: string | null;
      filesWritten?: string[];
      workflow?: { filesWritten?: string[]; verificationOk?: boolean };
      entries?: Array<{ stage: string; status: string; message: string; details?: string }>;
      latestAction?: { status?: string; summary?: string; detail?: string } | null;
      failureReport?: { rootCauseLine?: string } | null;
    } | null;

    const targetsLog = run?.entries?.find((e) =>
      /Apply targets resolved/i.test(e.message),
    );
    const patchTargets =
      targetsLog?.details
        ?.match(/patchTargets:\s*([^\n]+)/i)?.[1]
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    const rejected =
      targetsLog?.details
        ?.match(/rejectedFiles:\s*([^\n]+)/i)?.[1]
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    const written =
      run?.workflow?.filesWritten ?? run?.filesWritten ?? [];

    await saveJson("05-targets.json", { patchTargets, rejected, written, targetsLog });

    expect(written.some((p) => /App\.tsx$/i.test(p))).toBeTruthy();
    expect(written.some((p) => /(^|\/)main\.tsx$/i.test(p))).toBeFalsy();
    expect(patchTargets.some((p) => /(^|\/)main\.tsx$/i.test(p))).toBeFalsy();

    const writeIdx =
      run?.entries?.findIndex(
        (e) =>
          e.stage === "apply_plan" &&
          e.status === "success" &&
          /Wrote \d+ file/i.test(e.message),
      ) ?? -1;
    const verifyIdx =
      run?.entries?.findIndex(
        (e) => e.stage === "verification" && e.status === "success",
      ) ?? -1;
    expect(writeIdx).toBeGreaterThanOrEqual(0);
    expect(verifyIdx).toBeGreaterThan(writeIdx);

    expect(run?.runResult).toBe("success");
    expect(snapshot.readiness?.greenfieldRun?.active).toBe(false);
    expect(snapshot.pipeline?.buildRunning).toBe(false);

    const narration = [
      run?.finalMessage,
      run?.latestAction?.summary,
      run?.latestAction?.detail,
      run?.failureReport?.rootCauseLine,
    ]
      .filter(Boolean)
      .join("\n");
    expect(narration).not.toMatch(/couldn['’]t safely apply this edit/i);
    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/couldn['’]t safely apply this edit/i);
    expect(
      await page.getByText(/Editing…|Editing\.\.\./i).isVisible().catch(() => false),
    ).toBeFalsy();
    expect(
      await page.getByRole("button", { name: /^Cancel$/i }).isVisible().catch(() => false),
    ).toBeFalsy();

    const crash = consoleErrors.some((e) =>
      /WorkspaceProvider|Maximum update depth|Cannot read propert/i.test(e),
    );
    const providerError = consoleErrors.some((e) => /provider:error/i.test(e));
    const transportEvents =
      (snapshot.transport as { events?: Array<{ type?: string; level?: string; message?: string }> } | null)
        ?.events ?? [];
    const transportProviderError = transportEvents.some(
      (e) =>
        /provider:error/i.test(String(e.type ?? "")) ||
        /provider:error/i.test(String(e.message ?? "")),
    );
    await saveJson("06-console-errors.json", {
      consoleErrors: consoleErrors.slice(0, 50),
      crash,
      providerError,
      transportProviderError,
    });
    expect(crash).toBeFalsy();
    expect(providerError || transportProviderError).toBeFalsy();

    const after = {
      App: await sha256File(appTsx),
      css: await sha256File(indexCss),
    };
    await saveJson("07-after-hashes.json", { before, after });
    expect(after.App).not.toBe(before.App);

    const afterApp = await fs.readFile(appTsx, "utf8");
    expect(afterApp).toMatch(/clear|confirm/i);

    // Preview: start + show clear-completed UI.
    const previewStart = await page.evaluate(async (target) => {
      const api = window.bryantlabs;
      if (!api?.greenfieldPreviewStart) return { ok: false, error: "no api" };
      return api.greenfieldPreviewStart(target);
    }, PROJECT_PATH);
    await saveJson("08-preview-start.json", previewStart);
    expect(previewStart && "ok" in previewStart ? previewStart.ok : false).toBeTruthy();
    const previewUrl =
      previewStart && "url" in previewStart && typeof previewStart.url === "string"
        ? previewStart.url
        : null;
    expect(previewUrl).toBeTruthy();
    await page.evaluate((u) => {
      window.__studioTestHooks?.simulatePreviewReady?.({ url: u ?? undefined });
    }, previewUrl);
    const previewTab = page.getByRole("tab", { name: "Preview", exact: true });
    if (await previewTab.isVisible().catch(() => false)) {
      await previewTab.click({ force: true });
    }

    const previewPagePromise = app.waitForEvent("window");
    await app.evaluate(
      async ({ BrowserWindow }, args) => {
        const win = new BrowserWindow({
          width: 1100,
          height: 900,
          show: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false },
        });
        await win.loadURL(args.url);
        await win.webContents.executeJavaScript(`
          localStorage.setItem("task-manager-tasks", JSON.stringify([
            {
              id: "c1",
              text: "Done task",
              completed: true,
              createdAt: Date.now() - 1000,
              priority: "medium",
              dueDate: null
            },
            {
              id: "a1",
              text: "Active task",
              completed: false,
              createdAt: Date.now(),
              priority: "low",
              dueDate: null
            }
          ]));
        `);
        await win.loadURL(args.url);
        await new Promise((r) => setTimeout(r, 1200));
      },
      { url: previewUrl! },
    );
    const previewPage = await previewPagePromise;
    await previewPage.waitForSelector("body", { timeout: 20_000 });
    await previewPage.waitForTimeout(800);

    const clearBtn = previewPage.getByRole("button", {
      name: /clear completed|clear all completed|clear done/i,
    });
    await expect(clearBtn).toBeVisible({ timeout: 15_000 });

    previewPage.once("dialog", async (dialog) => {
      await dialog.accept();
    });
    await clearBtn.click();
    await previewPage.waitForTimeout(500);
    await expect(previewPage.getByText("Done task")).toHaveCount(0);
    await expect(previewPage.getByText("Active task")).toBeVisible();

    await previewPage.screenshot({
      path: path.join(ARTIFACT_DIR, "09-preview-clear-completed.png"),
      fullPage: true,
    });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "10-studio-after-success.png"),
      fullPage: true,
    });

    // Final inactive check after preview work.
    const finalSnap = await page.evaluate(() => {
      const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
      const pipeline = window.__studioTestHooks?.getPatchPipelineState?.();
      return {
        runResult: run?.runResult ?? null,
        active: window.__studioTestHooks?.getReadinessState?.()?.greenfieldRun?.active,
        buildRunning: pipeline?.buildRunning ?? null,
      };
    });
    await saveJson("11-final-status.json", finalSnap);
    expect(finalSnap.runResult).toBe("success");
    expect(finalSnap.active).toBe(false);
    expect(finalSnap.buildRunning).toBe(false);

    await app.close();
  });
});

async function sha256File(filePath: string): Promise<string> {
  const buf = await fs.readFile(filePath);
  return createHash("sha256").update(buf).digest("hex");
}

async function saveJson(name: string, value: unknown): Promise<void> {
  await fs.writeFile(
    path.join(ARTIFACT_DIR, name),
    `${JSON.stringify(value, null, 2)}\n`,
    "utf8",
  );
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
