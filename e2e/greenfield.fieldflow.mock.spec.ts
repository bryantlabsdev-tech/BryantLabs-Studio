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
  openExistingProjectAt,
  openFixtureProject,
  sendAgentPrompt,
  waitForComposerReady,
  waitForGreenfieldRunTerminal,
  assertNoRenderLoopConsoleErrors,
} from "./helpers/studio";
import { teardownTrackedStudioProcesses } from "./helpers/processTeardown";

const FIELDFLOW_PROMPT = `Build FieldFlow — a multi-page field-service website using React Router and localStorage.

BRYANTLABS_E2E_FIXTURE:fieldflow-multipage

Pages:
- Dashboard
- Jobs
- Calendar
- Clients
- Settings

Include a jobs/projects list, a job detail view, a scheduling/calendar view, shared navigation, reusable components, and responsive styling. Routes must survive refresh.`;

const EXPECTED_FILES = [
  "package.json",
  "index.html",
  "src/main.tsx",
  "src/App.tsx",
  "src/index.css",
  "src/types.ts",
  "src/hooks/useLocalStorage.ts",
  "src/data/seed.ts",
  "src/components/Layout.tsx",
  "src/components/Sidebar.tsx",
  "src/components/jobs/JobCard.tsx",
  "src/components/jobs/JobDetail.tsx",
  "src/components/ui/StatusBadge.tsx",
  "src/pages/Dashboard.tsx",
  "src/pages/Jobs.tsx",
  "src/pages/Calendar.tsx",
  "src/pages/Clients.tsx",
  "src/pages/Settings.tsx",
  "public/logo.svg",
  "public/favicon.svg",
] as const;

async function pathExists(target: string): Promise<boolean> {
  try {
    await fs.access(target);
    return true;
  } catch {
    return false;
  }
}

async function waitForPreviewUrl(page: Page): Promise<string> {
  await page.waitForFunction(
    () => Boolean(window.__studioTestHooks?.getReadinessState?.()?.previewPanel?.url),
    undefined,
    { timeout: 60_000 },
  );
  const url = await page.evaluate(
    () => window.__studioTestHooks?.getReadinessState?.()?.previewPanel?.url ?? "",
  );
  expect(url).toMatch(/^https?:\/\//);
  return url;
}

async function openPreviewWindow(app: ElectronApplication, url: string): Promise<Page> {
  const previewPagePromise = app.waitForEvent("window");
  await app.evaluate(async ({ BrowserWindow }, previewUrl) => {
    const win = new BrowserWindow({
      width: 1280,
      height: 900,
      show: true,
      webPreferences: { contextIsolation: true, nodeIntegration: false },
    });
    await win.loadURL(previewUrl);
  }, url);
  const preview = await previewPagePromise;
  await preview.waitForLoadState("domcontentloaded");
  return preview;
}

test.describe("FieldFlow greenfield (mock provider)", () => {
  let app: ElectronApplication | undefined;
  let page: Page;
  let projectDir = "";
  let userDataDir = "";
  let previewPage: Page | undefined;

  test.beforeAll(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-fieldflow-multipage-"));
    userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-fieldflow-user-"));
    await fs.writeFile(path.join(projectDir, ".gitkeep"), "\n");
    app = await launchStudioApp({ e2eProject: null, userDataDir });
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openFixtureProject(page, projectDir);
    await waitForComposerReady(page);
  });

  test.afterAll(async () => {
    try {
      if (previewPage && !previewPage.isClosed()) {
        await previewPage.close().catch(() => undefined);
      }
      if (page) await assertNoRenderLoopConsoleErrors(page);
    } finally {
      await closeStudioApp(app);
      await teardownTrackedStudioProcesses();
      if (projectDir) {
        await fs.rm(projectDir, { recursive: true, force: true }).catch(() => undefined);
      }
      if (userDataDir) {
        await fs.rm(userDataDir, { recursive: true, force: true }).catch(() => undefined);
      }
    }
  });

  test("creates a multi-page FieldFlow website through the Studio workflow", async () => {
    test.setTimeout(240_000);

    await fillAgentPrompt(page, FIELDFLOW_PROMPT);
    await expect(page.locator("#build-prompt")).toHaveValue(FIELDFLOW_PROMPT);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);

    const outcome = await waitForGreenfieldRunTerminal(page);
    expect(outcome).toBe("success");

    const run = await page.evaluate(() => {
      const snapshot = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
      const ready = window.__studioTestHooks?.getReadinessState?.();
      return {
        runResult: snapshot?.runResult ?? ready?.greenfieldRun.runResult ?? null,
        lastFailureReason: ready?.greenfieldRun.lastFailureReason ?? null,
        setupOk: snapshot?.setupResult?.ok ?? null,
        typecheckOk: snapshot?.setupResult?.typecheck?.ok ?? null,
        buildOk: snapshot?.setupResult?.build?.ok ?? null,
        filesWritten: snapshot?.filesWritten ?? [],
        hasBuildSuccess: snapshot?.entries?.some(
          (entry) => entry.stage === "build" && entry.status === "success",
        ),
        hasTypecheckSuccess: snapshot?.entries?.some(
          (entry) =>
            (entry.stage === "typescript" || entry.stage === "typecheck") &&
            entry.status === "success",
        ),
        previewUrl: ready?.previewPanel.url ?? null,
        previewRunning: ready?.previewPanel.running ?? null,
      };
    });
    expect(run.runResult).toBe("success");
    expect(String(run.lastFailureReason ?? "").toLowerCase()).not.toMatch(
      /typecheck failed|build failed|preview failed|write failed/,
    );
    expect(run.setupOk).toBe(true);
    expect(run.typecheckOk).toBe(true);
    expect(run.buildOk).toBe(true);
    expect(run.hasBuildSuccess).toBe(true);
    expect(run.hasTypecheckSuccess).toBe(true);
    expect(run.filesWritten.length).toBeGreaterThan(EXPECTED_FILES.length - 1);

    for (const rel of EXPECTED_FILES) {
      expect(await pathExists(path.join(projectDir, rel)), rel).toBe(true);
    }
    const jobsDir = await fs.stat(path.join(projectDir, "src/components/jobs"));
    expect(jobsDir.isDirectory()).toBe(true);
    const publicDir = await fs.stat(path.join(projectDir, "public"));
    expect(publicDir.isDirectory()).toBe(true);

    const previewTab = page.getByRole("tab", { name: "Preview", exact: true });
    if (await previewTab.isVisible().catch(() => false)) {
      const selected = await previewTab.getAttribute("aria-selected");
      if (selected !== "true") await previewTab.click();
    }
    const previewUrl = await waitForPreviewUrl(page);
    expect(run.previewRunning === true || Boolean(previewUrl)).toBe(true);

    previewPage = await openPreviewWindow(app!, previewUrl);
    await expect(previewPage.getByRole("heading", { name: /FieldFlow Dashboard/i })).toBeVisible();
    await expect(previewPage.getByRole("navigation", { name: /Primary/i })).toBeVisible();

    const routes: Array<{ name: RegExp; heading: RegExp; path: string }> = [
      { name: /^Jobs$/i, heading: /^Jobs$/i, path: "/jobs" },
      { name: /^Calendar$/i, heading: /^Schedule$/i, path: "/calendar" },
      { name: /^Clients$/i, heading: /^Clients$/i, path: "/clients" },
      { name: /^Settings$/i, heading: /^Settings$/i, path: "/settings" },
      { name: /^Dashboard$/i, heading: /FieldFlow Dashboard/i, path: "/" },
    ];
    for (const route of routes) {
      await previewPage.getByRole("link", { name: route.name }).click();
      await expect(previewPage.getByRole("heading", { name: route.heading })).toBeVisible();
      expect(new URL(previewPage.url()).pathname).toBe(route.path);
    }

    await previewPage.getByRole("link", { name: /^Jobs$/i }).click();
    await previewPage.getByRole("link", { name: /Open job detail/i }).first().click();
    await expect(previewPage.getByRole("heading", { name: /Harbor Clinic roof repair/i })).toBeVisible();
    expect(new URL(previewPage.url()).pathname).toBe("/jobs/job-1");

    await previewPage.reload({ waitUntil: "domcontentloaded" });
    await expect(previewPage.getByRole("heading", { name: /Harbor Clinic roof repair/i })).toBeVisible();
    expect(new URL(previewPage.url()).pathname).toBe("/jobs/job-1");

    await previewPage.close().catch(() => undefined);
    previewPage = undefined;

    await closeStudioApp(app);
    app = undefined;

    for (const rel of EXPECTED_FILES) {
      expect(await pathExists(path.join(projectDir, rel)), `persisted ${rel}`).toBe(true);
    }

    app = await launchStudioApp({ e2eProject: null, userDataDir });
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openExistingProjectAt(page, projectDir);
    await waitForComposerReady(page);

    const reopened = await page.evaluate(() => {
      const ready = window.__studioTestHooks?.getReadinessState?.();
      return {
        projectPath: ready?.projectPath ?? null,
        indexed: ready?.indexedSourceFileCount ?? 0,
      };
    });
    expect(reopened.projectPath).toBe(projectDir);
    expect(reopened.indexed).toBeGreaterThan(0);
    expect(await fs.readFile(path.join(projectDir, "src/pages/Dashboard.tsx"), "utf8")).toMatch(
      /FieldFlow Dashboard/,
    );
  });
});
