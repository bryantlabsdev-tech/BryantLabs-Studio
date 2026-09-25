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

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd, env: process.env, encoding: "utf8" });
  return (stdout ?? "").trim();
}

async function snapshot(repo: string) {
  const head = await git(repo, ["rev-parse", "HEAD"]);
  const branch = await git(repo, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const refs = await git(repo, ["show-ref"]);
  const remotes = await git(repo, ["remote", "-v"]).catch(() => "");
  const config = await git(repo, ["config", "--local", "--list"]);
  const worktrees = await git(repo, ["worktree", "list", "--porcelain"]);
  return { head, branch, refs, remotes, config, worktrees };
}

async function makeRepo(): Promise<string> {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), "bl-agent-policy-e2e-"));
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.email", "test@example.test"]);
  await git(repo, ["config", "user.name", "Test"]);
  await fs.writeFile(path.join(repo, "README.md"), "policy\n", "utf8");
  await git(repo, ["add", "README.md"]);
  await git(repo, ["commit", "-m", "init"]);
  await git(repo, ["tag", "v-keep"]);
  return repo;
}

test.describe("Agent execution policy (mock provider)", () => {
  let app: ElectronApplication | undefined;
  let page: Page;
  let repo = "";

  test.afterAll(async () => {
    await closeStudioApp(app);
    if (repo) await fs.rm(repo, { recursive: true, force: true }).catch(() => undefined);
  });

  test("denies instruction and prompt attacks without mutating the fixture", async () => {
    repo = await makeRepo();
    const before = await snapshot(repo);
    const outside = await fs.mkdtemp(path.join(os.tmpdir(), "bl-agent-policy-out-"));
    await fs.writeFile(path.join(outside, "keep.txt"), "keep\n", "utf8");

    app = await launchStudioApp();
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openFixtureProject(page, repo);
    await waitForComposerReady(page);

    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByTestId("agent-execution-policy")).toBeVisible({ timeout: 20_000 });
    await expect(page.getByTestId("agent-execution-isolation")).toContainText("application");
    await expect(page.getByTestId("agent-execution-isolation")).toContainText("not an OS sandbox");
    await expect(page.getByTestId("agent-execution-autonomous")).toContainText("no network-capable recipe");
    await expect(page.getByTestId("agent-execution-project-code")).toContainText("not network-isolated");
    await expect(page.getByTestId("agent-execution-network")).toContainText("No kernel firewall or OS sandbox");
    await expect(page.getByTestId("agent-execution-filesystem")).toContainText("do not confine");

    const attacks = [
      { recipe: "npm_run_build" },
      { recipe: "git_status", command: "npm test", cwd: repo, argv: ["run", "build"] },
      { recipe: "git_status", env: { PATH: "/tmp" }, network: "open" },
      { recipe: "git_push" },
      { recipe: "npx_tsc" },
    ];
    for (const attack of attacks) {
      const result = await page.evaluate(async (payload) => {
        const api = window.bryantlabs as typeof window.bryantlabs & {
          terminalExec?: unknown;
        };
        if (typeof api?.terminalExec === "function") return { leaked: true };
        return api.executeAgentInspect(payload as never);
      }, attack);
      expect("leaked" in result && result.leaked === true).toBe(false);
      expect("ok" in result && result.ok === true).toBe(false);
    }

    const allowed = await page.evaluate(async () => {
      return window.bryantlabs.executeAgentInspect({ recipe: "git_status" });
    });
    expect(allowed && "ok" in allowed && allowed.ok).toBe(true);

    const after = await snapshot(repo);
    expect(after.head).toBe(before.head);
    expect(after.branch).toBe(before.branch);
    expect(after.refs).toBe(before.refs);
    expect(after.remotes).toBe(before.remotes);
    expect(after.config).toBe(before.config);
    expect(after.worktrees).toBe(before.worktrees);
    expect(await fs.readFile(path.join(outside, "keep.txt"), "utf8")).toBe("keep\n");

    const denials = await page.evaluate(async () => window.bryantlabs?.getAgentExecutionDenials?.() ?? []);
    expect(denials.length).toBeGreaterThan(0);
    const blob = JSON.stringify(denials);
    expect(blob.includes("SSH_AUTH_SOCK")).toBe(false);
    expect(blob.includes("HOME=")).toBe(false);
    expect(blob.includes("network: denied")).toBe(false);
  });
});
