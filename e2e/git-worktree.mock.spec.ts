import { execFile } from "node:child_process";
import { promisify } from "node:util";
import crypto from "node:crypto";
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

async function snapshot(repo: string) {
  const branch = await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = await git(repo, ["rev-parse", "HEAD"]);
  const refs = await git(repo, ["show-ref"]);
  const worktrees = await git(repo, ["worktree", "list", "--porcelain"]);
  const status = (await git(repo, ["status", "--porcelain=v1", "-u", "--no-renames"]))
    .split("\n")
    .filter((line) => line.trim() && !line.includes(".bryantlabs"))
    .join("\n");
  const remotes = await git(repo, ["remote", "-v"]).catch(() => "");
  const hashes = await hashWorkspace(repo);
  return { branch, head, refs, worktrees, status, remotes, hashes };
}

async function makeWorktreeWorkspace(): Promise<{ repo: string; extra: string }> {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "bl-git-worktree-e2e-"));
  const extra = await fs.mkdtemp(path.join(os.tmpdir(), "bl-git-worktree-e2e-ext-"));
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.email", "test@example.test"]);
  await git(repo, ["config", "user.name", "Test"]);
  await fs.writeFile(path.join(repo, "README.md"), "demo\n", "utf8");
  await git(repo, ["add", "README.md"]);
  await git(repo, ["commit", "-m", "init"]);
  await git(repo, ["tag", "v-keep"]);
  await git(repo, ["worktree", "add", extra, "-b", "feature/external-keep"]);
  return { repo, extra };
}

test.describe("Studio-managed Git worktrees (mock provider)", () => {
  let app: ElectronApplication | undefined;
  let page: Page;
  let repo = "";
  let extra = "";

  test.afterAll(async () => {
    await closeStudioApp(app);
    if (repo) await fs.rm(repo, { recursive: true, force: true }).catch(() => undefined);
    if (extra) await fs.rm(extra, { recursive: true, force: true }).catch(() => undefined);
  });

  test("create, open, and remove a managed worktree without touching unrelated git state", async () => {
    const created = await makeWorktreeWorkspace();
    repo = created.repo;
    extra = created.extra;
    const originalHead = await git(repo, ["rev-parse", "HEAD"]);
    const extraHead = await git(extra, ["rev-parse", "HEAD"]);
    const extraStatus = await git(extra, ["status", "--porcelain=v1"]);
    console.log(`GIT_WORKTREE_E2E_EXTERNAL ${JSON.stringify({ extra, extraHead, extraStatus })}`);

    app = await launchStudioApp();
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openFixtureProject(page, repo);
    await waitForComposerReady(page);
    await page.getByRole("button", { name: "Source Control" }).click();
    await expect(page.getByTestId("git-worktrees-section")).toBeVisible({ timeout: 20_000 });
    await expect(
      page.locator('[data-testid="git-worktree-row"][data-worktree-branch="feature/external-keep"]'),
    ).toContainText("Read-only");

    const before = await snapshot(repo);
    console.log(
      `GIT_WORKTREE_E2E_BEFORE ${JSON.stringify({
        branch: before.branch,
        head: before.head,
        status: before.status,
        refs: before.refs.split("\n"),
        worktrees: before.worktrees,
      })}`,
    );

    await page.getByTestId("git-worktree-new").fill("feature/e2e-wt");
    await page.getByTestId("git-worktree-create-btn").click();
    await expect(page.getByTestId("git-worktree-create-dialog")).toBeVisible();
    await page.getByTestId("git-worktree-create-cancel").click();
    await expect(page.getByTestId("git-worktree-create-dialog")).toHaveCount(0);
    const afterCreateCancel = await snapshot(repo);
    console.log(`GIT_WORKTREE_E2E_AFTER_CREATE_CANCEL ${afterCreateCancel.branch} ${afterCreateCancel.head}`);
    expect(afterCreateCancel).toEqual(before);

    await page.getByTestId("git-worktree-new").fill("feature/e2e-wt");
    await page.getByTestId("git-worktree-create-btn").click();
    await expect(page.getByTestId("git-worktree-create-dialog")).toBeVisible();
    await page.getByTestId("git-worktree-create-confirm").click();
    await expect(page.getByTestId("git-worktree-notice")).toContainText(/Created worktree on feature\/e2e-wt/i, {
      timeout: 20_000,
    });
    const afterCreate = await snapshot(repo);
    console.log(`GIT_WORKTREE_E2E_AFTER_CREATE ${afterCreate.branch} ${afterCreate.head}`);
    expect(afterCreate.branch).toBe("main");
    expect(afterCreate.head).toBe(originalHead);
    expect(afterCreate.hashes).toEqual(before.hashes);
    expect(afterCreate.remotes).toBe(before.remotes);
    expect(afterCreate.status).toBe("");
    expect(afterCreate.refs).toContain("refs/tags/v-keep");
    expect(afterCreate.refs).toContain("refs/heads/feature/external-keep");
    const createdHeads = afterCreate.refs.split("\n").filter((line) => line.includes("refs/heads/"));
    const beforeHeads = before.refs.split("\n").filter((line) => line.includes("refs/heads/"));
    expect(createdHeads.length).toBe(beforeHeads.length + 1);
    expect(afterCreate.refs).toContain("refs/heads/feature/e2e-wt");
    const createdTrees = afterCreate.worktrees.split("\n").filter((line) => line.startsWith("worktree ")).length;
    const beforeTrees = before.worktrees.split("\n").filter((line) => line.startsWith("worktree ")).length;
    expect(createdTrees).toBe(beforeTrees + 1);

    const studioRow = page.locator('[data-testid="git-worktree-row"][data-worktree-branch="feature/e2e-wt"]');
    await expect(studioRow).toContainText("Studio worktree");
    await studioRow.getByTestId("git-worktree-open").click();
    await page.getByRole("button", { name: "Source Control" }).click();
    await expect(page.getByTestId("git-branch-select")).toHaveValue("feature/e2e-wt", { timeout: 20_000 });
    const openedHead = await git(repo, ["rev-parse", "HEAD"]);
    expect(openedHead).toBe(originalHead);

    const mainRow = page.locator('[data-testid="git-worktree-row"][data-worktree-branch="main"]');
    await mainRow.getByTestId("git-worktree-open").click();
    await page.getByRole("button", { name: "Source Control" }).click();
    await expect(page.getByTestId("git-branch-select")).toHaveValue("main", { timeout: 20_000 });

    const studioAgain = page.locator('[data-testid="git-worktree-row"][data-worktree-branch="feature/e2e-wt"]');
    await expect(studioAgain).toHaveAttribute("data-worktree-can-remove", "1", { timeout: 20_000 });
    const trees = await git(repo, ["worktree", "list", "--porcelain"]);
    const wtLine = trees.split("\n").find((line) => line.startsWith("worktree ") && line.includes("/wt-"));
    expect(wtLine).toBeTruthy();
    const wtPath = wtLine!.slice("worktree ".length);
    const openedStatus = await git(wtPath, ["status", "--porcelain=v2", "-uall"]);
    console.log(`GIT_WORKTREE_E2E_MANAGED_STATUS_AFTER_OPEN ${openedStatus}`);
    expect(openedStatus.includes("features.json")).toBe(false);
    expect(openedStatus.includes("mcp.json")).toBe(false);
    await studioAgain.getByTestId("git-worktree-remove").click();
    await expect(page.getByTestId("git-worktree-remove-dialog")).toBeVisible();
    await page.getByTestId("git-worktree-remove-cancel").click();
    await expect(page.getByTestId("git-worktree-remove-dialog")).toHaveCount(0);
    expect((await git(repo, ["show-ref"])).includes("refs/heads/feature/e2e-wt")).toBe(true);

    await studioAgain.getByTestId("git-worktree-remove").click();
    await expect(page.getByTestId("git-worktree-remove-dialog")).toBeVisible();
    await page.getByTestId("git-worktree-remove-confirm").click();
    await expect(page.getByTestId("git-worktree-notice")).toContainText(/Removed worktree for feature\/e2e-wt/i, {
      timeout: 20_000,
    });
    const afterRemove = await snapshot(repo);
    console.log(`GIT_WORKTREE_E2E_AFTER_REMOVE ${afterRemove.worktrees}`);
    expect(afterRemove.refs).toContain("refs/heads/feature/e2e-wt");
    expect(afterRemove.refs).toContain("refs/heads/feature/external-keep");
    expect(afterRemove.refs).toContain("refs/tags/v-keep");
    expect(afterRemove.branch).toBe("main");
    expect(afterRemove.head).toBe(originalHead);
    expect(afterRemove.hashes).toEqual(before.hashes);
    const afterTrees = afterRemove.worktrees.split("\n").filter((line) => line.startsWith("worktree ")).length;
    expect(afterTrees).toBe(beforeTrees);
    expect(afterRemove.worktrees).toContain(extra);
  });
});
