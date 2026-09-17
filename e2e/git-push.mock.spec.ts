import { execFile } from "node:child_process";
import { promisify } from "node:util";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
  closeStudioApp,
  dismissBlockingDialogs,
  getMainWindow,
  launchStudioApp,
  openFixtureProject,
  waitForComposerReady,
} from "./helpers/studio";

const exec = promisify(execFile);
const gitEnv = {
  ...process.env,
  GIT_AUTHOR_NAME: "Test",
  GIT_AUTHOR_EMAIL: "test@example.test",
  GIT_COMMITTER_NAME: "Test",
  GIT_COMMITTER_EMAIL: "test@example.test",
};

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd, env: gitEnv, encoding: "utf8" });
  return (stdout ?? "").trim();
}

async function listRefs(bare: string): Promise<string[]> {
  try {
    const out = await git(bare, ["show-ref", "--heads", "--tags"]);
    return out ? out.split("\n").map((line) => line.replace(/^[0-9a-f]+ /, "")).filter(Boolean) : [];
  } catch {
    return [];
  }
}

async function makePushWorkspace(): Promise<{ repo: string; bare: string }> {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "bl-git-push-e2e-"));
  const bare = await fs.mkdtemp(path.join(os.tmpdir(), "bl-git-push-e2e-bare-"));
  await git(bare, ["init", "--bare"]);
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.email", "test@example.test"]);
  await git(repo, ["config", "user.name", "Test"]);
  await git(repo, ["config", "init.defaultBranch", "main"]);
  await fs.writeFile(path.join(repo, "README.md"), "demo\n", "utf8");
  await git(repo, ["add", "README.md"]);
  await git(repo, ["commit", "-m", "init"]);
  await git(repo, ["checkout", "-b", "feature/e2e-push"]);
  await fs.writeFile(path.join(repo, "note.txt"), "push me\n", "utf8");
  await git(repo, ["add", "note.txt"]);
  await git(repo, ["commit", "-m", "feature commit"]);
  await git(repo, ["remote", "add", "origin", bare]);
  await git(repo, ["tag", "v-should-not-push"]);
  return { repo, bare };
}

test.describe("Approval-gated Git push (mock provider)", () => {
  let app: ElectronApplication | undefined;
  let page: Page;
  let repo = "";
  let bare = "";

  test.afterAll(async () => {
    await closeStudioApp(app);
    if (repo) await fs.rm(repo, { recursive: true, force: true }).catch(() => undefined);
    if (bare) await fs.rm(bare, { recursive: true, force: true }).catch(() => undefined);
  });

  test("cancel leaves remote empty; confirm pushes only the current feature branch", async () => {
    const created = await makePushWorkspace();
    repo = created.repo;
    bare = created.bare;

    app = await launchStudioApp();
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openFixtureProject(page, repo);
    await waitForComposerReady(page);

    await page.getByRole("button", { name: "Source Control" }).click();
    await expect(page.getByTestId("git-push-btn")).toBeVisible({ timeout: 20_000 });

    const before = await listRefs(bare);
    console.log(`GIT_PUSH_E2E_REFS_BEFORE ${JSON.stringify(before)}`);

    await page.getByTestId("git-push-btn").click();
    await expect(page.getByTestId("git-push-dialog")).toBeVisible();
    const opened = await listRefs(bare);
    console.log(`GIT_PUSH_E2E_REFS_DIALOG_OPEN ${JSON.stringify(opened)}`);
    expect(opened).toEqual(before);

    await page.getByTestId("git-push-cancel").click();
    await expect(page.getByTestId("git-push-dialog")).toHaveCount(0);
    const cancelled = await listRefs(bare);
    console.log(`GIT_PUSH_E2E_REFS_AFTER_CANCEL ${JSON.stringify(cancelled)}`);
    expect(cancelled).toEqual([]);

    await page.getByTestId("git-push-btn").click();
    await expect(page.getByTestId("git-push-dialog")).toBeVisible();
    await expect(page.getByText("origin/feature/e2e-push", { exact: true })).toBeVisible();
    await page.getByTestId("git-push-confirm").click();
    await expect(page.getByText(/Pushed feature\/e2e-push to origin/i)).toBeVisible({
      timeout: 20_000,
    });

    const after = await listRefs(bare);
    console.log(`GIT_PUSH_E2E_REFS_AFTER_CONFIRM ${JSON.stringify(after)}`);
    expect(after).toEqual(["refs/heads/feature/e2e-push"]);
    expect(after.includes("refs/heads/main")).toBe(false);
    expect(after.some((ref) => ref.startsWith("refs/tags/"))).toBe(false);

    const body = await page.content();
    expect(body).not.toMatch(/ghp_|github_pat_|glpat-/);
  });
});
