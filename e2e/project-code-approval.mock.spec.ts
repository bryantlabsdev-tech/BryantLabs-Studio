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
  await fs.mkdir(path.join(repo, "scripts"), { recursive: true });
  await fs.writeFile(
    path.join(repo, "scripts", "hello.js"),
    "require('node:fs').writeFileSync('approved.txt', 'ran\\n');\n",
    "utf8",
  );
  await fs.writeFile(path.join(repo, "README.md"), "policy\n", "utf8");
  await git(repo, ["add", "README.md", "scripts/hello.js"]);
  await git(repo, ["commit", "-m", "init"]);
  return repo;
}

test.describe("Approval-gated project code (mock provider)", () => {
  let app: ElectronApplication | undefined;
  let page: Page;
  let repo = "";
  let other = "";

  test.afterAll(async () => {
    await closeStudioApp(app);
    if (repo) await fs.rm(repo, { recursive: true, force: true }).catch(() => undefined);
    if (other) await fs.rm(other, { recursive: true, force: true }).catch(() => undefined);
  });

  test("confirms, cancels, and rejects forged project-code approvals", async () => {
    repo = await makeRepo("bl-project-code-e2e-");
    other = await makeRepo("bl-project-code-other-");
    app = await launchStudioApp();
    page = await getMainWindow(app);
    await dismissBlockingDialogs(page);
    await openFixtureProject(page, repo);
    await waitForComposerReady(page);
    await page.getByRole("button", { name: "Settings", exact: true }).click();
    await expect(page.getByTestId("project-code-request")).toBeVisible({ timeout: 20_000 });

    await page.getByTestId("project-code-script").fill("scripts/hello.js");
    await page.getByTestId("project-code-review").click();
    await expect(page.getByTestId("project-code-approval")).toBeVisible();
    await expect(page.getByTestId("project-code-executable")).not.toHaveText("");
    await expect(page.getByTestId("project-code-arguments")).toContainText("scripts/hello.js");
    await expect(page.getByTestId("project-code-cwd")).toContainText(repo);
    await expect(page.getByTestId("project-code-network")).toContainText("not an OS, network, filesystem, container, or VM sandbox");
    await expect(page.getByTestId("project-code-timeout")).toContainText("ms");
    await expect(page.getByTestId("project-code-risk")).toContainText("access files and the network");
    await page.getByTestId("project-code-cancel").click();
    await expect(page.getByTestId("project-code-approval")).toHaveCount(0);
    await expect(fs.access(path.join(repo, "approved.txt"))).rejects.toThrow();

    const untrusted = await page.evaluate(async () => {
      const preview = await window.bryantlabs.prepareProjectCodeExecution({ script: "scripts/hello.js" });
      if (!preview || !("previewId" in preview) || !preview.ok) return { ok: false as const, code: "prepare" };
      return window.bryantlabs.approveProjectCodeExecution(preview.previewId);
    });
    expect(untrusted.ok).toBe(false);
    expect("code" in untrusted && untrusted.code).toBe("approval_invalid");
    await expect(fs.access(path.join(repo, "approved.txt"))).rejects.toThrow();

    await page.getByTestId("project-code-review").click();
    await expect(page.getByTestId("project-code-approval")).toBeVisible();
    const windowPromise = app.waitForEvent("window");
    await page.getByTestId("project-code-approve").click();
    const trusted = await windowPromise;
    await trusted.getByRole("button", { name: "Approve and run" }).click();
    await expect(page.getByTestId("project-code-note")).toContainText("finished", { timeout: 20_000 });
    expect(await fs.readFile(path.join(repo, "approved.txt"), "utf8")).toBe("ran\n");

    const attacks = await page.evaluate(async () => {
      const api = window.bryantlabs;
      const substitution = await api.prepareProjectCodeExecution({
        script: "scripts/hello.js",
        args: ["$(id)"],
      });
      const forged = await api.executeApprovedProjectCode({ token: "ab".repeat(16) });
      const mutated = await api.executeApprovedProjectCode({
        token: "cd".repeat(16),
        script: "scripts/hello.js",
        argv: ["id"],
      } as never);
      const preview = await api.prepareProjectCodeExecution({ script: "scripts/hello.js" });
      const direct =
        preview && "previewId" in preview && preview.ok
          ? await api.approveProjectCodeExecution(preview.previewId)
          : { ok: false as const, code: "missing" };
      return { substitution, forged, mutated, direct, previewId: preview && "previewId" in preview ? preview.previewId : "" };
    });
    expect(attacks.substitution.ok).toBe(false);
    expect(attacks.forged.ok).toBe(false);
    expect("code" in attacks.forged && attacks.forged.code).toBe("approval_invalid");
    expect(attacks.mutated.ok).toBe(false);
    expect(attacks.direct.ok).toBe(false);

    const switchedPromise = page.evaluate(async (previewId) => {
      return window.bryantlabs.confirmProjectCodeExecution(previewId);
    }, attacks.previewId);
    const switchedWindow = await app.waitForEvent("window");
    await openFixtureProject(page, other);
    await switchedWindow.getByRole("button", { name: "Approve and run" }).click();
    const switched = await switchedPromise;
    expect(switched.ok).toBe(false);
    expect("code" in switched && (switched.code === "project_changed" || switched.code === "approval_invalid")).toBe(true);

    const approvals = await page.evaluate(async () => window.bryantlabs.getAgentExecutionApprovals());
    const blob = JSON.stringify(approvals);
    expect(blob.includes("Bearer ")).toBe(false);
    expect(blob.includes("$(id)")).toBe(false);
  });
});
