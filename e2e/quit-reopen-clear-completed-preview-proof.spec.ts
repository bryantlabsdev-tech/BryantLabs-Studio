/**
 * Prove clear-completed button + confirmation executes in Preview.
 * Edit already applied by quit-reopen acceptance; this is visual/exec proof only.
 */
import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import { _electron as electron } from "playwright";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  closeStudioApp,
  dismissBlockingDialogs,
  getMainWindow,
  projectRoot,
  trackRootPid,
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

test.describe("Clear-completed preview exec proof", () => {
  test.skip(!ACCEPTANCE_REAL, "Set BRYANTLABS_ACCEPTANCE_REAL=1");
  test.setTimeout(120_000);

  let app: ElectronApplication | undefined;
  test.afterAll(async () => {
    await closeStudioApp(app);
  });

  test("Preview shows clear button and confirmation clears completed tasks", async () => {
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });
    const appSource = await fs.readFile(path.join(PROJECT_PATH, "src/App.tsx"), "utf8");
    expect(appSource).toMatch(/Clear Completed|showClearConfirm|handleClearCompleted/);

    const userDataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "bryantlabs-clear-preview-"),
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

    app = await electron.launch({
      args: ["."],
      cwd: projectRoot,
      env,
      timeout: 30_000,
    });
    trackRootPid(app.process()?.pid);
    const page: Page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await waitForStudioTestHooks(page);
    await page.evaluate(async (target) => {
      await window.__studioTestHooks?.openProjectAt?.(target);
    }, PROJECT_PATH);

    const previewStart = await page.evaluate(async (target) => {
      return window.bryantlabs?.greenfieldPreviewStart?.(target);
    }, PROJECT_PATH);
    expect(previewStart?.ok).toBeTruthy();
    const url = previewStart && "url" in previewStart ? String(previewStart.url) : "";
    expect(url).toBeTruthy();

    const previewPagePromise = app.waitForEvent("window");
    await app.evaluate(
      async ({ BrowserWindow }, previewUrl) => {
        const win = new BrowserWindow({
          width: 1100,
          height: 900,
          show: true,
          webPreferences: { contextIsolation: true, nodeIntegration: false },
        });
        await win.loadURL(previewUrl);
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
        await win.loadURL(previewUrl);
        await new Promise((r) => setTimeout(r, 1200));
      },
      url,
    );
    const previewPage = await previewPagePromise;
    await previewPage.waitForSelector(".clear-completed-btn, button", { timeout: 20_000 });

    const clearBtn = previewPage.getByRole("button", { name: /Clear Completed/i });
    await expect(clearBtn).toBeVisible();
    await previewPage.screenshot({
      path: path.join(ARTIFACT_DIR, "09a-before-clear.png"),
      fullPage: true,
    });

    await clearBtn.click();
    const confirmYes = previewPage.getByRole("button", { name: /Yes, clear/i });
    await expect(confirmYes).toBeVisible();
    await previewPage.screenshot({
      path: path.join(ARTIFACT_DIR, "09b-confirm-dialog.png"),
      fullPage: true,
    });
    await confirmYes.click();
    await expect(previewPage.getByText("Done task")).toHaveCount(0);
    await expect(previewPage.getByText("Active task")).toBeVisible();
    await previewPage.screenshot({
      path: path.join(ARTIFACT_DIR, "09-preview-clear-completed.png"),
      fullPage: true,
    });

    await fs.writeFile(
      path.join(ARTIFACT_DIR, "09-preview-exec.json"),
      `${JSON.stringify(
        {
          body: (await previewPage.locator("body").innerText()).slice(0, 3000),
          ok: true,
        },
        null,
        2,
      )}\n`,
    );

    await closeStudioApp(app);
  });
});
