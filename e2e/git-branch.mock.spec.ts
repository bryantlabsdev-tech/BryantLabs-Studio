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
  const status = (await git(repo, ["status", "--porcelain=v1", "-u", "--no-renames"]))
    .split("\n")
    .filter((line) => line.trim() && !line.includes(".bryantlabs"))
    .join("\n");
  const remotes = await git(repo, ["remote", "-v"]).catch(() => "");
  const hashes = await hashWorkspace(repo);
  return { branch, head, refs, status, remotes, hashes };
}

async function makeBranchWorkspace(): Promise<string> {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "bl-git-branch-e2e-"));
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.email", "test@example.test"]);
  await git(repo, ["config", "user.name", "Test"]);
  await fs.writeFile(path.join(repo, "README.md"), "demo\n", "utf8");
  await git(repo, ["add", "README.md"]);
  await git(repo, ["commit", "-m", "init"]);
  await git(repo, ["checkout", "-b", "feature/other"]);
  await fs.writeFile(path.join(repo, "other.txt"), "other\n", "utf8");
  await git(repo, ["add", "other.txt"]);
  await git(repo, ["commit", "-m", "other"]);
  await git(repo, ["tag", "v-keep"]);
  await git(repo, ["checkout", "main"]);
  return repo;
}

test.describe("Safe Git branch create/switch (mock provider)", () => {
  let app: ElectronApplication | undefined;
  let page: Page;
  let repo = "";

  test.afterAll(async () => {
    await closeStudioApp(app);
    if (repo) await fs.rm(repo, { recursive: true, force: true }).catch(() => undefined);
  });

  test("cancel leaves HEAD unchanged; create and switch only move HEAD", async () => {
    repo = await makeBranchWorkspace();
    const originalHead = await git(repo, ["rev-parse", "HEAD"]);

    app = await launchStudioApp();
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openFixtureProject(page, repo);
    await waitForComposerReady(page);
    await page.getByRole("button", { name: "Source Control" }).click();
    await expect(page.getByTestId("git-branch-select")).toBeVisible({ timeout: 20_000 });

    const before = await snapshot(repo);
    console.log(`GIT_BRANCH_E2E_BEFORE ${JSON.stringify({
      branch: before.branch,
      head: before.head,
      status: before.status,
      refs: before.refs.split("\n"),
    })}`);

    await page.getByTestId("git-branch-new").fill("feature/e2e-created");
    await page.getByTestId("git-branch-create-btn").click();
    await expect(page.getByTestId("git-branch-dialog")).toBeVisible();
    await page.getByTestId("git-branch-cancel").click();
    await expect(page.getByTestId("git-branch-dialog")).toHaveCount(0);
    const afterCreateCancel = await snapshot(repo);
    console.log(`GIT_BRANCH_E2E_AFTER_CREATE_CANCEL ${afterCreateCancel.branch} ${afterCreateCancel.head}`);
    expect(afterCreateCancel.branch).toBe("main");
    expect(afterCreateCancel.head).toBe(originalHead);
    expect(afterCreateCancel.refs).toBe(before.refs);

    await page.getByTestId("git-branch-select").selectOption("feature/other");
    await expect(page.getByTestId("git-branch-dialog")).toBeVisible();
    await page.getByTestId("git-branch-cancel").click();
    await expect(page.getByTestId("git-branch-dialog")).toHaveCount(0);
    const afterSwitchCancel = await snapshot(repo);
    console.log(`GIT_BRANCH_E2E_AFTER_SWITCH_CANCEL ${afterSwitchCancel.branch} ${afterSwitchCancel.head}`);
    expect(afterSwitchCancel.branch).toBe("main");
    expect(afterSwitchCancel.head).toBe(originalHead);

    await page.getByTestId("git-branch-new").fill("feature/e2e-created");
    await page.getByTestId("git-branch-create-btn").click();
    await expect(page.getByTestId("git-branch-dialog")).toBeVisible();
    await page.getByTestId("git-branch-confirm").click();
    await expect(page.getByTestId("git-branch-notice")).toContainText(/Created and switched to feature\/e2e-created/i, {
      timeout: 20_000,
    });
    const afterCreate = await snapshot(repo);
    console.log(`GIT_BRANCH_E2E_AFTER_CREATE ${afterCreate.branch} ${afterCreate.head}`);
    expect(afterCreate.branch).toBe("feature/e2e-created");
    expect(afterCreate.head).toBe(originalHead);
    expect(afterCreate.refs.split("\n").filter((line) => line.includes("refs/heads/")).length).toBe(
      before.refs.split("\n").filter((line) => line.includes("refs/heads/")).length + 1,
    );
    expect(afterCreate.refs).toContain("refs/tags/v-keep");
    expect(afterCreate.hashes).toEqual(before.hashes);
    expect(afterCreate.remotes).toBe(before.remotes);
    expect(afterCreate.status).toBe("");

    await page.getByTestId("git-branch-select").selectOption("feature/other");
    await expect(page.getByTestId("git-branch-dialog")).toBeVisible();
    await page.getByTestId("git-branch-confirm").click();
    await expect(page.getByTestId("git-branch-notice")).toContainText(/Switched to feature\/other/i, {
      timeout: 20_000,
    });
    const afterSwitch = await snapshot(repo);
    console.log(`GIT_BRANCH_E2E_AFTER_SWITCH ${afterSwitch.branch} ${afterSwitch.head}`);
    expect(afterSwitch.branch).toBe("feature/other");
    expect(afterSwitch.head).not.toBe(originalHead);
    expect(afterSwitch.refs.split("\n").sort().join("\n")).toBe(afterCreate.refs.split("\n").sort().join("\n"));
    expect(afterSwitch.hashes.get("README.md")).toBe(before.hashes.get("README.md"));

    await fs.writeFile(path.join(repo, "dirty-e2e.txt"), "dirty\n", "utf8");
    await page.getByRole("button", { name: "Refresh" }).click();
    await expect(page.locator(".git-view__dirty")).toContainText(/changes/, { timeout: 10_000 });
    await expect(page.getByTestId("git-branch-select")).toBeDisabled();
    await expect(page.getByTestId("git-branch-create-btn")).toBeDisabled();
    await expect(page.getByTestId("git-branch-select")).toBeDisabled();
    const dirty = await snapshot(repo);
    expect(dirty.branch).toBe("feature/other");
    console.log(`GIT_BRANCH_E2E_DIRTY_STATUS ${JSON.stringify(dirty.status)}`);
  });
});
