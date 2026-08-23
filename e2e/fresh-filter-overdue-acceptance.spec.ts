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
  "e2e/test-results/acceptance-fresh-filter-overdue",
);
const REAL_USER_DATA = path.join(
  os.homedir(),
  "Library/Application Support/bryantlabs-studio",
);
const PROJECT_PATH =
  process.env.BRYANTLABS_ACCEPTANCE_PROJECT ??
  "/var/folders/d7/281my_0x699cf3gqqf6ndvbm0000gn/T/bryantlabs-task-manager-8YOB4Y";
const EDIT_PROMPT =
  "Add a high-priority-only filter and visually highlight overdue incomplete tasks.";
const DEADLINE = {
  appLaunch: 30_000,
  aiEdit: 240_000,
} as const;

test.describe("Fresh filter + overdue acceptance (real provider)", () => {
  test.skip(
    !ACCEPTANCE_REAL,
    "Set BRYANTLABS_ACCEPTANCE_REAL=1 to run the fresh real-provider acceptance.",
  );

  test.setTimeout(8 * 60_000);

  test("apply high-priority filter + overdue highlight through Electron UI", async () => {
    expect(projectRoot).toBe("/Users/ferrisb/Desktop/Bryantlabs Studio FIXED");
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });

    const appTsx = path.join(PROJECT_PATH, "src/App.tsx");
    const indexCss = path.join(PROJECT_PATH, "src/index.css");
    await fs.access(appTsx);
    await fs.access(indexCss);

    const beforeHashes = {
      App: await sha256File(appTsx),
      css: await sha256File(indexCss),
    };
    await saveJson("01-before-hashes.json", beforeHashes);

    const beforeApp = await fs.readFile(appTsx, "utf8");
    expect(beforeApp).not.toMatch(/high[- ]?priority[- ]?only|filter === ["']high["']/i);
    // Overdue date label styling may exist; require incomplete-task row highlight still missing.
    const beforeCss = await fs.readFile(indexCss, "utf8");
    expect(beforeCss).not.toMatch(/task-item\.overdue|overdue-incomplete|\.task\.overdue/i);

    const userDataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "bryantlabs-fresh-acceptance-"),
    );
    await fs.copyFile(
      path.join(REAL_USER_DATA, "provider-settings.json"),
      path.join(userDataDir, "provider-settings.json"),
    );

    const app = await launchRealStudio(userDataDir);
    const page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await waitForStudioTestHooks(page);

    await page.evaluate(async (target) => {
      await window.__studioTestHooks?.openProjectAt?.(target);
    }, PROJECT_PATH);
    await waitForComposerReady(page);

    await fillAgentPrompt(page, EDIT_PROMPT);
    await sendAgentPrompt(page);

    const applyOutcome = await waitForPatchApplied(page);
    expect(applyOutcome).toBe("patch_applied");

    // Allow fire-and-forget UI audit to settle without blocking success.
    await page.waitForTimeout(4_000);

    const snapshot = await page.evaluate(() => {
      const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
      const pipeline = window.__studioTestHooks?.getPatchPipelineState?.();
      const readiness = window.__studioTestHooks?.getReadinessState?.();
      return { run, pipeline, readiness };
    });
    await saveJson("02-run-snapshot.json", snapshot);

    const run = snapshot.run as {
      runResult?: string;
      finalMessage?: string | null;
      entries?: Array<{ stage: string; status: string; message: string; details?: string }>;
      uiAuditResult?: { advisory?: boolean; ok?: boolean; skipped?: boolean; details?: string };
      workflow?: { filesWritten?: string[]; filesAccepted?: number; verificationOk?: boolean };
      filesWritten?: string[];
    } | null;

    const targetsLog = run?.entries?.find((e) =>
      /Apply targets resolved/i.test(e.message),
    );
    const plannedFromLog =
      targetsLog?.details
        ?.match(/patchTargets:\s*([^\n]+)/i)?.[1]
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    const rejectedFromLog =
      targetsLog?.details
        ?.match(/rejectedFiles:\s*([^\n]+)/i)?.[1]
        ?.split(",")
        .map((s) => s.trim())
        .filter(Boolean) ?? [];
    const written =
      run?.workflow?.filesWritten ??
      run?.filesWritten ??
      [];
    const targetPaths =
      (snapshot.pipeline as { applyTargets?: Array<{ relPath: string }> } | null)
        ?.applyTargets?.map((t) => t.relPath) ??
      (plannedFromLog.length > 0 ? plannedFromLog : written);

    await saveJson("03-targets.json", {
      targetPaths,
      plannedFromLog,
      rejectedFromLog,
      written,
      pipelineTargets:
        (snapshot.pipeline as { applyTargets?: unknown } | null)?.applyTargets ?? [],
    });

    expect(targetPaths.some((p) => /App\.tsx$/i.test(p))).toBeTruthy();
    expect(targetPaths.some((p) => /index\.css$/i.test(p))).toBeTruthy();
    expect(targetPaths.some((p) => /(^|\/)main\.tsx$/i.test(p))).toBeFalsy();
    expect(rejectedFromLog.some((p) => /(^|\/)main\.tsx$/i.test(p))).toBeTruthy();
    expect(written).toEqual(expect.arrayContaining(["src/App.tsx", "src/index.css"]));

    expect(run?.runResult).toBe("success");
    const latest = (snapshot.run as { latestAction?: { summary?: string; detail?: string } | null } | null)
      ?.latestAction;
    const finalMessage = run?.finalMessage ?? latest?.summary ?? latest?.detail ?? "";
    expect(finalMessage).not.toMatch(/couldn['’]t safely apply this edit/i);
    expect(String(finalMessage).length).toBeGreaterThan(0);
    expect(String(latest?.summary ?? "")).toMatch(/success|completed|applied/i);

    const bodyText = await page.locator("body").innerText();
    expect(bodyText).not.toMatch(/couldn['’]t safely apply this edit/i);

    const cancelOnRun = page.getByRole("button", { name: /^Cancel$/i });
    expect(await cancelOnRun.isVisible().catch(() => false)).toBeFalsy();

    const editingVisible = await page
      .getByText(/Editing…|Editing\.\.\./i)
      .isVisible()
      .catch(() => false);
    expect(editingVisible).toBeFalsy();

    const wrote = run?.entries?.some(
      (e) =>
        e.stage === "apply_plan" &&
        e.status === "success" &&
        /Wrote \d+ file/i.test(e.message),
    );
    const verified = run?.entries?.some(
      (e) => e.stage === "verification" && e.status === "success",
    );
    expect(wrote).toBeTruthy();
    expect(verified).toBeTruthy();

    // Verification must appear after writes in the log order.
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
    expect(verifyIdx).toBeGreaterThan(writeIdx);

    const afterHashes = {
      App: await sha256File(appTsx),
      css: await sha256File(indexCss),
    };
    await saveJson("04-after-hashes.json", { beforeHashes, afterHashes });
    expect(afterHashes.App).not.toBe(beforeHashes.App);
    expect(afterHashes.css).not.toBe(beforeHashes.css);

    const afterApp = await fs.readFile(appTsx, "utf8");
    const afterCss = await fs.readFile(indexCss, "utf8");
    expect(afterApp).toMatch(/high/i);
    expect(afterApp).toMatch(/filter/i);
    expect(`${afterApp}\n${afterCss}`).toMatch(/overdue/i);

    await openPreview(page);
    await page.waitForTimeout(2_000);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "05-preview-filter-overdue.png"),
      fullPage: true,
    });

    // Capture preview iframe content when available.
    const frame = page.frameLocator('iframe[title*="Preview"], iframe.preview-frame, .preview-panel iframe').first();
    const previewText = await frame.locator("body").innerText().catch(() => "");
    await saveJson("06-preview-text.json", {
      previewText: previewText.slice(0, 4000),
      uiAudit: run?.uiAuditResult ?? null,
    });

    // UI audit must not reverse success (advisory-only if present).
    if (run?.uiAuditResult && run.uiAuditResult.ok === false) {
      expect(run.uiAuditResult.advisory === true || run.uiAuditResult.skipped === true).toBeTruthy();
    }
    expect(run?.runResult).toBe("success");

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
  if (process.env.PLAYWRIGHT_USE_DIST === "1") {
    delete env.VITE_DEV_SERVER_URL;
  } else {
    env.VITE_DEV_SERVER_URL = env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
  }
  return electron.launch({
    args: ["."],
    cwd: projectRoot,
    env,
    timeout: DEADLINE.appLaunch,
  });
}

async function openPreview(page: Page): Promise<void> {
  await dismissBlockingDialogs(page);
  const previewTab = page.getByRole("tab", { name: "Preview", exact: true });
  if (await previewTab.isVisible().catch(() => false)) {
    const selected = await previewTab.getAttribute("aria-selected");
    if (selected !== "true") await previewTab.click();
  }
}
