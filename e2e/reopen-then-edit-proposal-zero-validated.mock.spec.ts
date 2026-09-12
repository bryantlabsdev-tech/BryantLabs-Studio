import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
  closeStudioApp,
  dismissBlockingDialogs,
  emptyProjectFixturePath,
  fillAgentPrompt,
  projectRoot,
  getMainWindow,
  launchStudioApp,
  openExistingProjectAt,
  readIndexStatusLabel,
  readReadyIndexedFileCount,
  sendAgentPrompt,
  waitForComposerReady,
  waitForPatchApplied,
  assertNoRenderLoopConsoleErrors,
} from "./helpers/studio";

const TASK_MANAGER_APP = `export default function App() {
  return (
    <main className="task-manager">
      <h1>Tasks</h1>
      <ul>
        <li>Sample task</li>
      </ul>
      <form>
        <input aria-label="New task" placeholder="Add a task" />
        <button type="submit">Add</button>
      </form>
    </main>
  );
}
`;

async function seedDisposableTaskManager(): Promise<string> {
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), "bl-reopen-edit-"));
  const names = [
    "package.json",
    "package-lock.json",
    "index.html",
    "vite.config.ts",
    "tsconfig.json",
    "src/main.tsx",
    "src/index.css",
  ];
  for (const name of names) {
    const from = path.join(emptyProjectFixturePath, name);
    const to = path.join(dest, name);
    await fs.mkdir(path.dirname(to), { recursive: true });
    await fs.copyFile(from, to);
  }
  await fs.writeFile(path.join(dest, "src/App.tsx"), TASK_MANAGER_APP, "utf8");
  await fs.symlink(
    path.join(projectRoot, "node_modules"),
    path.join(dest, "node_modules"),
    "dir",
  );
  return dest;
}

test.describe("Reopen lifecycle: Apply Plan should generate proposals", () => {
  let app: ElectronApplication | undefined;
  let page: Page;
  let projectPath: string;

  const editPrompt = "Add priority levels and due dates to tasks.";

  test.setTimeout(360_000);

  test.beforeAll(async () => {
    // Disposable seeded copy — never mutate the shared empty-project fixture.
    projectPath = await seedDisposableTaskManager();
    app = await launchStudioApp({ e2eProject: null });
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);

    await openExistingProjectAt(page, projectPath);
    await waitForComposerReady(page);
    await page.locator("#build-prompt").waitFor({ state: "visible", timeout: 30_000 });
  });

  test.afterAll(async () => {
    await closeStudioApp(app);
    if (projectPath) {
      await fs.rm(projectPath, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  test("create + edit, quit, reopen, edit again (no zero-proposals failure)", async () => {
    await page.evaluate(() => {
      localStorage.setItem("bryantlabs.followUpReviewFirst", "0");
    });

    const readiness = await page.evaluate(() => window.__studioTestHooks?.getReadinessState?.());
    expect(String(readiness?.projectPath ?? "")).toContain("bl-reopen-edit-");

    await fillAgentPrompt(page, editPrompt);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);

    const beforeQuitOutcome = await waitForPatchApplied(page);
    const beforeQuitRun = await page.evaluate(() => window.__studioTestHooks?.getGreenfieldRunSnapshot?.());

    expect(beforeQuitOutcome).toBe("patch_applied");
    expect(String(beforeQuitRun?.failureReport?.rootCauseLine ?? "")).not.toMatch(
      /zero valid patch proposals/i,
    );
    await assertNoRenderLoopConsoleErrors(page);

    await closeStudioApp(app);

    app = await launchStudioApp({ e2eProject: null });
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);

    await openExistingProjectAt(page, projectPath);
    await waitForComposerReady(page);

    const reopenedIndexLabel = await readIndexStatusLabel(page);
    const reopenedIndexedFiles = await readReadyIndexedFileCount(page);
    void reopenedIndexLabel;
    void reopenedIndexedFiles;

    await page.evaluate(() => {
      localStorage.setItem("bryantlabs.followUpReviewFirst", "0");
    });

    await fillAgentPrompt(page, editPrompt);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);

    const afterReopenOutcome = await waitForPatchApplied(page);
    const afterReopenRun = await page.evaluate(() => window.__studioTestHooks?.getGreenfieldRunSnapshot?.());

    expect(afterReopenOutcome).toBe("patch_applied");
    expect(String(afterReopenRun?.failureReport?.rootCauseLine ?? "")).not.toMatch(
      /zero valid patch proposals/i,
    );

    await closeStudioApp(app);
    app = await launchStudioApp({ e2eProject: null });
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openExistingProjectAt(page, projectPath);
    await waitForComposerReady(page);

    await page.evaluate(() => {
      localStorage.setItem("bryantlabs.followUpReviewFirst", "0");
    });

    const secondEditPrompt = "Make the task list easier to scan visually.";
    await fillAgentPrompt(page, secondEditPrompt);
    await sendAgentPrompt(page);
    await dismissBlockingDialogs(page);

    const secondReopenOutcome = await waitForPatchApplied(page);
    const secondReopenRun = await page.evaluate(() => window.__studioTestHooks?.getGreenfieldRunSnapshot?.());

    expect(secondReopenOutcome).toBe("patch_applied");
    expect(String(secondReopenRun?.failureReport?.rootCauseLine ?? "")).not.toMatch(
      /zero valid patch proposals/i,
    );

    await assertNoRenderLoopConsoleErrors(page);
  });
});
