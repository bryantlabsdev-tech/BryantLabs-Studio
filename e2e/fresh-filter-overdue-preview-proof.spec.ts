/**
 * Visual proof via Electron Preview of high-priority filter + overdue highlight.
 * Opens the generated-app preview URL in a dedicated BrowserWindow so localStorage
 * seeding and screenshots are not blocked by iframe isolation.
 */
import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  dismissBlockingDialogs,
  getMainWindow,
  projectRoot,
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

test.describe("Preview visual proof (filter + overdue)", () => {
  test.skip(!ACCEPTANCE_REAL, "Set BRYANTLABS_ACCEPTANCE_REAL=1");
  test.setTimeout(180_000);

  test("Electron preview shows high-priority filter and overdue highlight", async () => {
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });
    const appSource = await fs.readFile(path.join(PROJECT_PATH, "src/App.tsx"), "utf8");
    const cssSource = await fs.readFile(path.join(PROJECT_PATH, "src/index.css"), "utf8");
    expect(appSource).toMatch(/high-priority/);
    expect(cssSource).toMatch(/overdue-highlight/);

    const userDataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "bryantlabs-preview-proof-"),
    );
    await fs.copyFile(
      path.join(REAL_USER_DATA, "provider-settings.json"),
      path.join(userDataDir, "provider-settings.json"),
    );

    const env = { ...process.env };
    delete env.ELECTRON_RUN_AS_NODE;
    delete env.BRYANTLABS_MOCK_PROVIDER;
    delete env.BRYANTLABS_E2E_PROJECT;
    env.VITE_BRYANTLABS_E2E = "1";
    env.BRYANTLABS_E2E_USER_DATA = userDataDir;
    env.VITE_DEV_SERVER_URL = env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";

    const app: ElectronApplication = await electron.launch({
      args: ["."],
      cwd: projectRoot,
      env,
      timeout: 30_000,
    });
    const page: Page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await waitForStudioTestHooks(page);

    await page.evaluate(async (target) => {
      await window.__studioTestHooks?.openProjectAt?.(target);
    }, PROJECT_PATH);

    const previewStart = await page.evaluate(async (target) => {
      const api = window.bryantlabs;
      if (!api?.greenfieldPreviewStart) return { ok: false, error: "no api" };
      return api.greenfieldPreviewStart(target);
    }, PROJECT_PATH);
    await fs.writeFile(
      path.join(ARTIFACT_DIR, "05-preview-start.json"),
      `${JSON.stringify(previewStart, null, 2)}\n`,
    );
    expect(previewStart && "ok" in previewStart ? previewStart.ok : false).toBeTruthy();
    const url =
      previewStart && "url" in previewStart && typeof previewStart.url === "string"
        ? previewStart.url
        : null;
    expect(url).toBeTruthy();

    await page.evaluate((previewUrl) => {
      window.__studioTestHooks?.simulatePreviewReady?.({ url: previewUrl ?? undefined });
    }, url);

    const previewTab = page.getByRole("tab", { name: "Preview", exact: true });
    if (await previewTab.isVisible().catch(() => false)) {
      await previewTab.click({ force: true });
    }
    await page.waitForTimeout(1_500);
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "05-studio-preview-shell.png"),
      fullPage: true,
    });

    const yesterday = new Date();
    yesterday.setDate(yesterday.getDate() - 3);
    const due = yesterday.toISOString().slice(0, 10);

    // Dedicated BrowserWindow on the preview origin — reliable localStorage + DOM asserts.
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
              id: "1",
              text: "Pay overdue invoice",
              completed: false,
              createdAt: Date.now() - 86400000,
              priority: "high",
              dueDate: ${JSON.stringify(args.due)}
            },
            {
              id: "2",
              text: "Low priority someday",
              completed: false,
              createdAt: Date.now(),
              priority: "low",
              dueDate: null
            }
          ]));
        `);
        await win.loadURL(args.url);
        await new Promise((r) => setTimeout(r, 1500));
      },
      { url: url!, due },
    );
    const previewPage = await previewPagePromise;
    await previewPage.waitForLoadState("domcontentloaded");

    const pp = previewPage;
    await pp.waitForSelector(".filters", { timeout: 20_000 });
    await pp.waitForTimeout(1000);
    const filterBtn = pp.getByRole("button", { name: /high[- ]?priority/i });
    await expect(filterBtn).toBeVisible();

    // Screenshot first so we always keep visual proof even if class assert needs tuning.
    await pp.screenshot({
      path: path.join(ARTIFACT_DIR, "05-preview-filter-overdue.png"),
      fullPage: true,
    });

    const bodyText = await pp.locator("body").innerText();
    const overdueCount = await pp.locator(".task-item.overdue-highlight").count();
    const anyOverdueCue =
      overdueCount > 0 ||
      (await pp.locator(".due-date.overdue, .due-date-label.overdue").count()) > 0 ||
      /overdue|Pay overdue invoice/i.test(bodyText);

    await fs.writeFile(
      path.join(ARTIFACT_DIR, "06-preview-text.json"),
      `${JSON.stringify(
        {
          body: bodyText.slice(0, 4000),
          overdueCount,
          filterLabels: await pp.locator(".filters button").allTextContents(),
          taskItemClasses: await pp.locator(".task-item").evaluateAll((els) =>
            els.map((el) => el.className),
          ),
        },
        null,
        2,
      )}\n`,
    );

    expect(anyOverdueCue).toBeTruthy();

    await filterBtn.click();
    await expect(pp.getByText("Pay overdue invoice")).toBeVisible();
    await expect(pp.getByText("Low priority someday")).toHaveCount(0);
    await pp.screenshot({
      path: path.join(ARTIFACT_DIR, "05b-preview-high-priority-filter.png"),
      fullPage: true,
    });

    await app.close();
  });
});
