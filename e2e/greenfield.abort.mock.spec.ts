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
  waitForComposerReady,
  waitForGreenfieldRunStarted,
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

const GENERATED_MARKERS = [
  "package.json",
  "src/App.tsx",
  "src/main.tsx",
  "src/pages/Dashboard.tsx",
] as const;

async function listProjectRelPaths(root: string): Promise<string[]> {
  const out: string[] = [];
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".DS_Store" || entry.name === ".bryantlabs") continue;
      const abs = path.join(dir, entry.name);
      const rel = path.relative(root, abs);
      if (entry.isDirectory()) await walk(abs);
      else out.push(rel.split(path.sep).join("/"));
    }
  }
  await walk(root);
  return out.sort();
}

test.describe("Greenfield Stop aborts mock FieldFlow generation", () => {
  let app: ElectronApplication | undefined;
  let page: Page;
  let projectDir = "";
  let userDataDir = "";

  test.beforeAll(async () => {
    projectDir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-abort-fieldflow-"));
    userDataDir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-abort-fieldflow-user-"));
    await fs.writeFile(path.join(projectDir, ".gitkeep"), "\n");
    app = await launchStudioApp({
      e2eProject: null,
      userDataDir,
      extraEnv: {
        BRYANTLABS_MOCK_GREENFIELD_DELAY_MS: "2500",
        BRYANTLABS_MOCK_GREENFIELD_DELAY_ONCE: "1",
      },
    });
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openFixtureProject(page, projectDir);
    await waitForComposerReady(page);
  });

  test.afterAll(async () => {
    try {
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

  test("Stop cancels the delayed run, writes nothing, then a new run completes", async () => {
    test.setTimeout(240_000);

    await fillAgentPrompt(page, FIELDFLOW_PROMPT);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);
    await waitForGreenfieldRunStarted(page);

    const cancel = page.getByTestId("agent-cancel");
    await expect(cancel).toBeVisible();
    await cancel.click();
    if (await page.getByTestId("agent-cancel").isVisible().catch(() => false)) {
      await page.getByTestId("agent-cancel").click();
    }

    const cancelled = await waitForGreenfieldRunTerminal(page);
    expect(cancelled).toBe("cancelled");

    const cancelledState = await page.evaluate(() => {
      const snapshot = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
      const ready = window.__studioTestHooks?.getReadinessState?.();
      return {
        runResult: snapshot?.runResult ?? ready?.greenfieldRun.runResult ?? null,
        finalMessage: snapshot?.finalMessage ?? ready?.greenfieldRun.lastFailureReason ?? null,
        active: ready?.greenfieldRun.active ?? null,
        filesWritten: snapshot?.filesWritten ?? [],
      };
    });
    expect(cancelledState.runResult).toBe("cancelled");
    expect(cancelledState.active).toBe(false);
    expect(String(cancelledState.finalMessage ?? "")).toMatch(/cancelled/i);
    expect(cancelledState.filesWritten).toEqual([]);

    const afterCancel = await listProjectRelPaths(projectDir);
    expect(afterCancel).toEqual([".gitkeep"]);
    for (const marker of GENERATED_MARKERS) {
      expect(afterCancel.includes(marker)).toBe(false);
    }

    await waitForComposerReady(page);
    await fillAgentPrompt(page, FIELDFLOW_PROMPT);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);

    await page.waitForFunction(
      () => {
        const run = window.__studioTestHooks?.getReadinessState?.()?.greenfieldRun;
        if (!run) return false;
        return run.runResult === "running" || run.active === true;
      },
      undefined,
      { timeout: 30_000 },
    );

    const outcome = await waitForGreenfieldRunTerminal(page);
    expect(outcome).toBe("success");

    const run = await page.evaluate(() => {
      const snapshot = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
      const ready = window.__studioTestHooks?.getReadinessState?.();
      return {
        runResult: snapshot?.runResult ?? ready?.greenfieldRun.runResult ?? null,
        setupOk: snapshot?.setupResult?.ok ?? null,
        buildOk: snapshot?.setupResult?.build?.ok ?? null,
        filesWritten: snapshot?.filesWritten ?? [],
        previewUrl: ready?.previewPanel.url ?? null,
        previewRunning: ready?.previewPanel.running ?? null,
      };
    });
    expect(run.runResult).toBe("success");
    expect(run.setupOk).toBe(true);
    expect(run.buildOk).toBe(true);
    expect(run.filesWritten.length).toBeGreaterThan(8);
    expect(run.previewUrl).toMatch(/^https?:\/\//);
    expect(run.previewRunning).toBe(true);
    expect(await listProjectRelPaths(projectDir)).toContain("package.json");
  });
});
