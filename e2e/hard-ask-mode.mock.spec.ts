import crypto from "node:crypto";
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
  sudokuFixturePath,
  waitForComposerReady,
} from "./helpers/studio";

const MUTATION_PROMPT =
  "Edit src/App.tsx and add a prominent Start Game button at the top of the board.";

async function copySudokuWorkspace(): Promise<string> {
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), "bl-hard-ask-e2e-"));
  await fs.cp(sudokuFixturePath, dest, {
    recursive: true,
    filter: (src) => !src.includes(`${path.sep}node_modules`) && !src.includes(".bryantlabs"),
  });
  return fs.realpath(dest);
}

async function hashWorkspace(root: string): Promise<Map<string, string>> {
  const hashes = new Map<string, string>();
  async function walk(dir: string): Promise<void> {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".bryantlabs" || entry.name === ".git") {
        continue;
      }
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        await walk(abs);
        continue;
      }
      const rel = path.relative(root, abs).split(path.sep).join("/");
      const buf = await fs.readFile(abs);
      hashes.set(rel, crypto.createHash("sha256").update(buf).digest("hex"));
    }
  }
  await walk(root);
  return hashes;
}

async function selectAskMode(page: Page): Promise<void> {
  const ask = page.getByTestId("composer-mode-ask");
  if (!(await ask.isVisible().catch(() => false))) {
    const options = page.getByRole("button", { name: /^Options$/i });
    if (await options.isVisible().catch(() => false)) {
      await options.click();
    }
  }
  await expect(ask).toBeVisible();
  await ask.click();
  await expect(ask).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByTestId("composer-ask-help")).toBeVisible();
}

test.describe("Hard Ask mode (mock provider)", () => {
  let app: ElectronApplication | undefined;
  let page: Page;
  let projectDir = "";
  let beforeHashes: Map<string, string> | undefined;
  let afterHashes: Map<string, string> | undefined;

  test.afterAll(async () => {
    await closeStudioApp(app);
    if (projectDir) {
      await fs.rm(projectDir, { recursive: true, force: true }).catch(() => undefined);
    }
  });

  test("Ask mutation prompt leaves fixture bytes unchanged", async () => {
    projectDir = await copySudokuWorkspace();
    beforeHashes = await hashWorkspace(projectDir);
    expect(beforeHashes.size).toBeGreaterThan(3);

    app = await launchStudioApp();
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openFixtureProject(page, projectDir);
    await waitForComposerReady(page);

    await selectAskMode(page);
    await fillAgentPrompt(page, MUTATION_PROMPT);
    await sendAgentPrompt(page);

    await expect(page.getByText(/Ask mode is read-only/i).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByTestId("agent-review-chip")).toBeHidden();

    const applyInvocations = await page.evaluate(() => {
      return window.__studioTestHooks?.getFollowUpSettlementDiagnostic?.()?.applyPlanInvocations ?? 0;
    });
    expect(applyInvocations).toBe(0);

    afterHashes = await hashWorkspace(projectDir);
    const beforePaths = [...beforeHashes.keys()].sort();
    const afterPaths = [...afterHashes.keys()].sort();
    const addedPaths = afterPaths.filter((rel) => !beforeHashes.has(rel));
    const deletedPaths = beforePaths.filter((rel) => !afterHashes.has(rel));
    console.log(`HARD_ASK_E2E_PATHS_ADDED ${JSON.stringify(addedPaths)}`);
    console.log(`HARD_ASK_E2E_PATHS_DELETED ${JSON.stringify(deletedPaths)}`);
    expect(addedPaths, `unexpected added paths: ${addedPaths.join(",")}`).toEqual([]);
    expect(deletedPaths, `unexpected deleted paths: ${deletedPaths.join(",")}`).toEqual([]);
    expect(afterHashes.size).toBe(beforeHashes.size);
    const beforeFingerprint = [...beforeHashes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([rel, hash]) => `${rel}:${hash}`)
      .join("\n");
    const afterFingerprint = [...afterHashes.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([rel, hash]) => `${rel}:${hash}`)
      .join("\n");
    console.log(`HARD_ASK_E2E_HASH_BEFORE\n${beforeFingerprint}`);
    console.log(`HARD_ASK_E2E_HASH_AFTER\n${afterFingerprint}`);
    expect(afterFingerprint).toBe(beforeFingerprint);
  });
});
