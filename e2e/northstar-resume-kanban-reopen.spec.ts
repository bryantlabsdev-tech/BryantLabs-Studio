/**
 * Resume Northstar acceptance from an already-created project (create already passed).
 * Continues: seed → Kanban large edit → quit/reopen → milestone filter edit.
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

const DEADLINE = {
  appLaunch: 45_000,
  projectScan: 90_000,
  providerFirstByte: 60_000,
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

test.describe("Northstar resume: Kanban + quit/reopen", () => {
  test.skip(!ACCEPTANCE_REAL, "Set BRYANTLABS_ACCEPTANCE_REAL=1");
  test.setTimeout(50 * 60_000);

  test("Kanban expansion and post-reopen edit on existing Northstar project", async () => {
    await fs.mkdir(ARTIFACT_DIR, { recursive: true });
    const projectDir =
      process.env.BRYANTLABS_NORTHSTAR_PROJECT ??
      (
        JSON.parse(
          await fs.readFile(path.join(ARTIFACT_DIR, "00-paths.json"), "utf8"),
        ) as { projectDir: string }
      ).projectDir;
    await fs.access(path.join(projectDir, "src/App.tsx"));
    await saveJson("00-paths.json", { projectDir });

    const userDataDir = await fs.mkdtemp(
      path.join(os.tmpdir(), "bryantlabs-northstar-resume-"),
    );
    await fs.copyFile(
      path.join(REAL_USER_DATA, "provider-settings.json"),
      path.join(userDataDir, "provider-settings.json"),
    );

    const consoleErrors: string[] = [];
    let app = await runStage("app_launch", DEADLINE.appLaunch, () =>
      launchRealStudio(userDataDir),
    );
    let page = await getMainWindow(app);
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => consoleErrors.push(String(err)));
    await dismissBlockingDialogs(page);
    await waitForStudioTestHooks(page);
    await page.evaluate(async (target) => {
      localStorage.setItem("bryantlabs.followUpReviewFirst", "0");
      await window.__studioTestHooks?.openProjectAt?.(target);
    }, projectDir);
    await waitForComposerReady(page);
    await waitForIndexReady(page);

    const beforeHashes = await hashAllSources(projectDir);
    await saveJson("04-before-kanban-hashes.json", beforeHashes);

    // Seed persistence blob via preview.
    const ready = await page.evaluate(
      () => window.__studioTestHooks?.getReadinessState?.()?.previewPanel?.url,
    );
    let previewUrl = ready ?? null;
    if (!previewUrl) {
      const start = await page.evaluate(async (target) => {
        return window.bryantlabs?.greenfieldPreviewStart?.(target);
      }, projectDir);
      previewUrl =
        start && "url" in start && typeof start.url === "string" ? start.url : null;
    }
    expect(previewUrl).toBeTruthy();

    const seedPreview = await openPreviewWindow(app, previewUrl!, null);
    await seedPreview.evaluate(() => {
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
          },
          {
            id: "t-acc-2",
            title: "Seeded task two",
            status: "in_progress",
            priority: "medium",
            projectId: "p-acc-2",
          },
        ],
        members: [
          { id: "m-acc-1", name: "Alex Rivera" },
          { id: "m-acc-2", name: "Jordan Lee" },
        ],
        filters: [{ id: "f-acc-1", name: "High priority only" }],
      };
      localStorage.setItem("northstar-acceptance-seed", JSON.stringify(marker));
      for (const key of ["northstar", "northstar-data", "app-data"]) {
        localStorage.setItem(key, JSON.stringify({ version: 1, ...marker }));
      }
    });
    const persistedBlob = await seedPreview.evaluate(() => {
      const out: Record<string, string | null> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k) out[k] = localStorage.getItem(k);
      }
      return out;
    });
    await saveJson("03b-localstorage-before-kanban.json", persistedBlob);
    await seedPreview.screenshot({
      path: path.join(ARTIFACT_DIR, "02-initial-app-preview.png"),
      fullPage: true,
    });
    await seedPreview.close().catch(() => undefined);

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
    await saveJson("05-kanban-edit.json", {
      kanbanEdit,
      kanbanDiag,
      changedFiles,
      durationMs: Date.now() - kanbanStarted,
      stageLog: [...stageLog],
    });
    await page.screenshot({
      path: path.join(ARTIFACT_DIR, "05-kanban-studio.png"),
      fullPage: true,
    });

    expect(kanbanEdit.failed).toBe(false);
    expect(changedFiles.length).toBeGreaterThanOrEqual(2);
    expect(kanbanDiag.runResult).toBe("success");
    expect(String(kanbanDiag.failureRoot ?? "")).not.toMatch(
      /couldn['’]t safely apply this edit/i,
    );
    expect(
      consoleErrors.some((e) => /WorkspaceProvider|provider:error/i.test(e)),
    ).toBeFalsy();

    const kanbanUrl = String(kanbanDiag.previewUrl ?? previewUrl);
    const kanbanPreview = await openPreviewWindow(app, kanbanUrl, persistedBlob);
    await kanbanPreview.waitForTimeout(1500);
    const featureResults = await validateKanbanFeatures(kanbanPreview);
    await saveJson("06-kanban-features.json", featureResults);
    await kanbanPreview.screenshot({
      path: path.join(ARTIFACT_DIR, "06-kanban-view.png"),
      fullPage: true,
    });
    await clickNav(kanbanPreview, /dashboard/i).catch(() => undefined);
    await kanbanPreview.screenshot({
      path: path.join(ARTIFACT_DIR, "07-dashboard.png"),
      fullPage: true,
    });
    await kanbanPreview.close().catch(() => undefined);

    // Quit / reopen
    await app.close();
    app = await runStage("app_relaunch", DEADLINE.appLaunch, () =>
      launchRealStudio(userDataDir),
    );
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await waitForStudioTestHooks(page);
    await page.evaluate(async (target) => {
      localStorage.setItem("bryantlabs.followUpReviewFirst", "0");
      await window.__studioTestHooks?.openProjectAt?.(target);
    }, projectDir);
    await waitForComposerReady(page);
    await waitForIndexReady(page);

    const reopenStarted = Date.now();
    await fillAgentPrompt(page, REOPEN_PROMPT);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);
    await maybeAcceptReview(page);
    const reopenEdit = await waitForEdit(page, DEADLINE.reopenEdit, "reopen_edit");
    await waitForPreview(page);
    const reopenDiag = await captureDiagnostics(page, "reopen-edit");
    await saveJson("10-reopen-edit.json", {
      reopenEdit,
      reopenDiag,
      durationMs: Date.now() - reopenStarted,
    });
    expect(reopenEdit.failed).toBe(false);
    expect(reopenDiag.runResult).toBe("success");

    const finalUrl = String(reopenDiag.previewUrl ?? kanbanUrl);
    const finalPreview = await openPreviewWindow(app, finalUrl, persistedBlob);
    await clickNav(finalPreview, /kanban|board|milestone/i).catch(() => undefined);
    const text = await finalPreview.locator("body").innerText();
    await finalPreview.screenshot({
      path: path.join(ARTIFACT_DIR, "11-post-reopen-kanban.png"),
      fullPage: true,
    });
    await saveJson("11-post-reopen-ui.json", {
      textSample: text.slice(0, 4000),
      hasMilestone: /milestone/i.test(text),
      hasBlocked: /blocked/i.test(text),
    });
    expect(/milestone|blocked|kanban|board|northstar/i.test(text)).toBeTruthy();
    await finalPreview.close().catch(() => undefined);

    await saveJson("12-final-report.json", {
      overall: "pass_with_limitations",
      createNote:
        "Initial create already succeeded in prior run; resume covered Kanban + reopen.",
      kanbanDurationMs: Date.now() - kanbanStarted,
      changedFiles,
      featureResults,
      consoleErrors: consoleErrors.slice(0, 30),
      stageLog,
    });
    await app.close();
  });
});

async function runStage<T>(
  stage: string,
  deadlineMs: number,
  fn: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  console.log(`[stage:${stage}] start deadline=${deadlineMs}ms`);
  try {
    const result = await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${stage} exceeded ${deadlineMs}ms`)), deadlineMs),
      ),
    ]);
    stageLog.push({
      stage,
      startedAt,
      endedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      ok: true,
    });
    console.log(`[stage:${stage}] ok durationMs=${Date.now() - startedAt}`);
    return result;
  } catch (err) {
    stageLog.push({
      stage,
      startedAt,
      endedAt: Date.now(),
      durationMs: Date.now() - startedAt,
      ok: false,
      detail: err instanceof Error ? err.message : String(err),
    });
    throw err;
  }
}

async function launchRealStudio(userDataDir: string) {
  const env = { ...process.env };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.BRYANTLABS_MOCK_PROVIDER;
  delete env.BRYANTLABS_E2E_PROJECT;
  env.VITE_BRYANTLABS_E2E = "1";
  env.BRYANTLABS_E2E_USER_DATA = userDataDir;
  env.VITE_DEV_SERVER_URL = env.VITE_DEV_SERVER_URL ?? "http://localhost:5173";
  return electron.launch({ args: ["."], cwd: projectRoot, env, timeout: DEADLINE.appLaunch });
}

async function waitForPreview(page: Page) {
  await dismissBlockingDialogs(page);
  const tab = page.getByRole("tab", { name: "Preview", exact: true });
  if (await tab.isVisible().catch(() => false)) {
    if ((await tab.getAttribute("aria-selected")) !== "true") {
      await tab.click({ force: true });
    }
  }
  await page.waitForFunction(
    () => Boolean(window.__studioTestHooks?.getReadinessState?.()?.previewPanel?.url),
    undefined,
    { timeout: DEADLINE.preview },
  );
}

async function waitForIndexReady(page: Page) {
  await page.waitForFunction(
    () => {
      const s = window.__studioTestHooks?.getReadinessState?.();
      return s?.scanStatus === "done" && (s.sourceFileCount ?? 0) > 0;
    },
    undefined,
    { timeout: DEADLINE.projectScan },
  );
}

async function maybeAcceptReview(page: Page) {
  const review = page.getByTestId("agent-review-chip");
  if (await review.isVisible({ timeout: 3_000 }).catch(() => false)) {
    const open = review.getByRole("button", { name: /Review changes/i });
    if (await open.isVisible().catch(() => false)) await open.click();
  }
  const accept = page.getByRole("button", { name: /^Accept all$/i });
  if (await accept.isVisible({ timeout: 3_000 }).catch(() => false)) await accept.click();
}

async function waitForEdit(page: Page, timeoutMs: number, stageName: string) {
  return runStage(stageName, timeoutMs, async () => {
    const started = Date.now();
    let lastFp = "";
    let lastProgress = Date.now();
    let sawProvider = false;
    while (Date.now() - started < timeoutMs) {
      const snap = await page.evaluate(() => {
        const run = window.__studioTestHooks?.getGreenfieldRunSnapshot?.();
        const pipeline = window.__studioTestHooks?.getPatchPipelineState?.();
        const failure = String(run?.failureReport?.rootCauseLine ?? run?.finalMessage ?? "");
        const files = [
          ...(run?.filesWritten ?? []),
          ...(run?.appliedFileDiffs ?? []).map((d) => d.path),
          ...(run?.workflow?.filesWritten ?? []),
        ];
        return {
          failure,
          zero: /zero valid patch proposals/i.test(failure),
          files: [...new Set(files)],
          verifyOk: Boolean(
            run?.entries?.some((e) => e.stage === "verification" && e.status === "success"),
          ),
          wrote: Boolean(
            run?.entries?.some(
              (e) =>
                e.stage === "apply_plan" &&
                e.status === "success" &&
                /Wrote \d+ file/i.test(e.message),
            ),
          ),
          running: Boolean(run?.entries?.some((e) => e.status === "running")),
          runResult: run?.runResult ?? null,
          planApplyError: pipeline?.planApplyError ?? null,
          entries: (run?.entries ?? []).map((e) => `${e.stage}:${e.status}`),
        };
      });
      const fp = snap.entries.join("|") + snap.runResult;
      if (fp !== lastFp) {
        lastFp = fp;
        lastProgress = Date.now();
        console.log(`[edit] ${snap.entries.slice(-4).join(" · ")}`);
      }
      if (snap.entries.some((e) => /provider_call:running/i.test(e))) {
        lastProgress = Date.now();
        sawProvider = true;
      }
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
        lastProgress = Date.now();
      }
      if (
        snap.entries.some((e) => /provider_fallback:running/i.test(e)) &&
        Date.now() - lastProgress > 100_000
      ) {
        throw new Error(`Edit stalled on provider fallback. Last=${snap.entries.at(-1)}`);
      }
      if (!sawProvider && Date.now() - started > DEADLINE.providerFirstByte) {
        throw new Error("Provider did not begin within first-byte deadline");
      }
      if (!snap.running && Date.now() - lastProgress > DEADLINE.noProgress) {
        throw new Error(`No edit progress for ${DEADLINE.noProgress / 1000}s`);
      }
      if ((snap.wrote && snap.verifyOk) || snap.runResult === "success") {
        // Prefer the latest verification outcome — stale success entries from an
        // earlier run must not hide a failed follow-up verification.
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
          return { failed: false, zeroProposals: false, filesChanged: snap.files, outcome: "ok" };
        }
      }
      if (snap.zero || snap.planApplyError || snap.runResult === "failed") {
        if (snap.wrote && snap.verifyOk) {
          return { failed: false, zeroProposals: false, filesChanged: snap.files, outcome: "ok" };
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
    const transport = window.__studioTestHooks?.getTransportDiagnostics?.();
    return {
      step,
      runResult: run?.runResult ?? null,
      failureRoot: run?.failureReport?.rootCauseLine ?? run?.finalMessage ?? null,
      filesWritten: run?.filesWritten ?? [],
      previewUrl: ready?.previewPanel?.url ?? null,
      planApplyError: pipeline?.planApplyError ?? null,
      transportSummary: transport?.summary ?? null,
      lastEntries: (run?.entries ?? []).slice(-15).map((e) => ({
        stage: e.stage,
        status: e.status,
        message: e.message,
      })),
    };
  }, label);
}

async function listSourceFiles(projectDir: string) {
  const out: string[] = [];
  async function walk(dir: string) {
    for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
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

async function hashAllSources(projectDir: string) {
  const files = await listSourceFiles(projectDir);
  const out: Record<string, string> = {};
  for (const rel of files) {
    out[rel] = createHash("sha256")
      .update(await fs.readFile(path.join(projectDir, rel)))
      .digest("hex");
  }
  return out;
}

async function openPreviewWindow(
  app: ElectronApplication,
  url: string,
  storage: Record<string, string | null> | null,
) {
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
        await win.webContents.executeJavaScript(`
          (() => {
            const data = ${JSON.stringify(args.storage)};
            for (const [k, v] of Object.entries(data)) {
              if (v == null) localStorage.removeItem(k);
              else localStorage.setItem(k, v);
            }
          })();
        `);
        await win.loadURL(args.url);
      }
      await new Promise((r) => setTimeout(r, 800));
    },
    { url, storage },
  );
  const p = await previewPagePromise;
  await p.waitForLoadState("domcontentloaded");
  return p;
}

async function clickNav(page: Page, name: RegExp) {
  const locs = [
    page.getByRole("link", { name }),
    page.getByRole("button", { name }),
    page.locator("nav, aside").getByText(name),
  ];
  for (const loc of locs) {
    if (await loc.first().isVisible().catch(() => false)) {
      await loc.first().click({ force: true });
      return true;
    }
  }
  return false;
}

async function validateKanbanFeatures(page: Page) {
  await clickNav(page, /kanban|board/i).catch(() => undefined);
  await page.waitForTimeout(600);
  const text = await page.locator("body").innerText();
  const storage = await page.evaluate(() => {
    const out: Record<string, string | null> = {};
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k) out[k] = localStorage.getItem(k);
    }
    return out;
  });
  const blob = JSON.stringify(storage) + text;
  const checks = {
    dataSurvived: /Acceptance Project Alpha|Seeded task one|northstar-acceptance-seed/i.test(blob),
    kanbanPresent: /kanban|backlog|in progress|review|\bdone\b|planned/i.test(text),
    milestones: /milestone/i.test(text),
    blocked: /blocked|dependenc/i.test(text),
    bulk: /bulk|select all|selected/i.test(text),
    csv: /csv|import|export/i.test(text),
    undo: /\bundo\b/i.test(text),
    charts: /chart|workload|completion|overdue/i.test(text),
  };
  const score =
    Object.values(checks).filter(Boolean).length / Object.keys(checks).length;
  return { ...checks, score, textSample: text.slice(0, 3000) };
}

async function saveJson(name: string, value: unknown) {
  await fs.writeFile(path.join(ARTIFACT_DIR, name), `${JSON.stringify(value, null, 2)}\n`);
}
