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

async function makeRepo(name: string): Promise<string> {
  const repo = await fs.mkdtemp(path.join(os.tmpdir(), name));
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.email", "test@example.test"]);
  await git(repo, ["config", "user.name", "Test"]);
  await fs.writeFile(
    path.join(repo, "package.json"),
    JSON.stringify({
      name: "fixture",
      private: true,
      scripts: {
        pretest: "node -e \"require('node:fs').writeFileSync('hook.txt','hook')\"",
        test: "node -e \"require('node:fs').writeFileSync('ran.txt','ran')\"",
      },
    }),
    "utf8",
  );
  await fs.writeFile(path.join(repo, "package-lock.json"), "{}\n", "utf8");
  await fs.mkdir(path.join(repo, "node_modules", ".bin"), { recursive: true });
  await fs.writeFile(path.join(repo, "README.md"), "policy\n", "utf8");
  await git(repo, ["add", "README.md", "package.json", "package-lock.json"]);
  await git(repo, ["commit", "-m", "init"]);
  return repo;
}

test.describe("Approval-gated package scripts (mock provider)", () => {
  let app: ElectronApplication | undefined;
  let page: Page;
  let repo = "";

  test.afterAll(async () => {
    await closeStudioApp(app);
    if (repo) await fs.rm(repo, { recursive: true, force: true }).catch(() => undefined);
  });

  test("confirms a package script and rejects forged approval", async () => {
    repo = await makeRepo("bl-package-script-e2e-");
    app = await launchStudioApp();
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openFixtureProject(page, repo);
    await waitForComposerReady(page);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByTestId("package-script-request")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("package-script-name-input").fill("install");
    await page.getByTestId("package-script-review").click();
    await expect(page.getByTestId("package-script-note")).toContainText("Lifecycle");
    await expect(fs.access(path.join(repo, "ran.txt"))).rejects.toThrow();

    await page.getByTestId("package-script-name-input").fill("test");
    await page.getByTestId("package-script-review").click();
    await expect(page.getByTestId("package-script-approval")).toBeVisible();
    await expect(page.getByTestId("package-script-name")).toHaveText("test");
    await expect(page.getByTestId("package-script-body")).toContainText("ran.txt");
    await expect(page.getByTestId("package-script-executable")).toHaveText("/bin/sh");
    await expect(page.getByTestId("package-script-arguments")).toHaveText("none");
    await expect(page.getByTestId("package-script-path")).toContainText("node_modules/.bin");
    await expect(page.getByTestId("package-script-cwd")).toContainText(repo);
    await expect(page.getByTestId("package-script-timeout")).toContainText("ms");
    await expect(page.getByTestId("package-script-environment")).toContainText("node_modules/.bin");
    await expect(page.getByTestId("package-script-warning")).toContainText("not content-bound");
    await page.getByTestId("package-script-cancel").click();
    await expect(page.getByTestId("package-script-approval")).toHaveCount(0);

    const untrusted = await page.evaluate(async () => {
      const preview = await window.bryantlabs.preparePackageScriptExecution({ script: "test" });
      if (!preview || !("previewId" in preview) || !preview.ok) return { ok: false as const, code: "prepare" };
      return window.bryantlabs.approvePackageScriptExecution(preview.previewId);
    });
    expect(untrusted.ok).toBe(false);
    expect("code" in untrusted && untrusted.code).toBe("approval_invalid");

    await page.getByTestId("package-script-review").click();
    await expect(page.getByTestId("package-script-approval")).toBeVisible();
    const windowPromise = app.waitForEvent("window");
    await page.getByTestId("package-script-approve").click();
    const trusted = await windowPromise;
    await expect(trusted.getByRole("heading", { name: "Approve package script" })).toBeVisible();
    await expect(trusted.locator("#script-name")).toHaveText("test");
    await expect(trusted.locator("#script-body")).toContainText("ran.txt");
    await expect(trusted.locator("#executable")).toHaveText("/bin/sh");
    await expect(trusted.locator("#arguments")).toHaveText("none");
    await expect(trusted.locator("#shell-warning")).toContainText("not content-bound");
    await trusted.getByRole("button", { name: "Approve and run" }).click();
    await expect(page.getByTestId("package-script-note")).toContainText("finished", { timeout: 20_000 });
    expect(await fs.readFile(path.join(repo, "ran.txt"), "utf8")).toBe("ran");
    await expect(fs.access(path.join(repo, "hook.txt"))).rejects.toThrow();

    const attacks = await page.evaluate(async () => {
      const api = window.bryantlabs;
      const substitution = await api.preparePackageScriptExecution({ script: "test", args: ["$(id)"] });
      const forged = await api.executeApprovedPackageScript({ token: "ab".repeat(16) });
      const npx = await api.preparePackageScriptExecution({ script: "npx" });
      const dev = await api.preparePackageScriptExecution({ script: "dev" });
      return { substitution, forged, npx, dev };
    });
    expect(attacks.substitution.ok).toBe(false);
    expect(attacks.forged.ok).toBe(false);
    expect("code" in attacks.forged && attacks.forged.code).toBe("approval_invalid");
    expect(attacks.npx.ok).toBe(false);
    expect(attacks.dev.ok).toBe(false);

    const approvals = await page.evaluate(async () => window.bryantlabs.getAgentExecutionApprovals());
    const blob = JSON.stringify(approvals);
    expect(blob.includes("writeFileSync")).toBe(false);
    expect(blob.includes("$(id)")).toBe(false);
  });
});
