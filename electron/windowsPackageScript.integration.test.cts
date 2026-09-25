/**
 * Command-level check for the production Windows shell path.
 * It does not set platform or windowsShellFixture, so discovery must use
 * C:\Windows\System32\reg.exe and HKLM SystemRoot. Non-Windows runners skip it.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";
import {
  executeApprovedPackageScript,
  preparePackageScriptApproval,
  resetAgentExecutionRuntimeForTests,
  runTrustedPackageScriptConfirmation,
  setAgentExecutionRuntimeForTests,
} from "./agentExecution.cjs";

const exec = promisify(execFile);
const onWindows = process.platform === "win32";

async function git(cwd: string, args: string[]): Promise<void> {
  await exec("git", args, { cwd, encoding: "utf8" });
}

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), "bl-win-pkg-"));
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.email", "test@example.test"]);
  await git(repo, ["config", "user.name", "Test"]);
  await writeFile(
    path.join(repo, "package.json"),
    JSON.stringify({
      name: "fixture",
      private: true,
      scripts: { test: "echo windows-package-script-ok" },
    }),
    "utf8",
  );
  await writeFile(path.join(repo, "package-lock.json"), "{}\n", "utf8");
  await mkdir(path.join(repo, "node_modules", ".bin"), { recursive: true });
  await writeFile(path.join(repo, "README.md"), "win\n", "utf8");
  await git(repo, ["add", "README.md", "package.json", "package-lock.json"]);
  await git(repo, ["commit", "-m", "init"]);
  return repo;
}

describe("real Windows package-script discovery", { skip: onWindows ? false : "requires the canonical C:\\Windows cmd.exe path" }, () => {
  it("runs the approved body through C:\\Windows cmd.exe and ignores poisoned shell env", async () => {
    const previous = {
      COMSPEC: process.env.COMSPEC,
      PATH: process.env.PATH,
      SystemRoot: process.env.SystemRoot,
      SYSTEMROOT: process.env.SYSTEMROOT,
      WINDIR: process.env.WINDIR,
    };
    process.env.COMSPEC = "D:\\evil\\cmd.exe";
    process.env.PATH = "D:\\evil";
    process.env.SystemRoot = "D:\\AttackerWin";
    process.env.SYSTEMROOT = "D:\\AttackerWin";
    process.env.WINDIR = "D:\\AttackerWin";
    resetAgentExecutionRuntimeForTests();
    setAgentExecutionRuntimeForTests({ trustedDecision: async () => "approve" });
    try {
      const repo = await makeRepo();
      const prepared = await preparePackageScriptApproval({
        payload: { script: "test" },
        projectRoot: repo,
        ownerId: 7,
        senderAllowed: true,
      });
      assert.equal(prepared.ok, true, !prepared.ok ? `${prepared.code} ${prepared.error}` : "");
      if (!prepared.ok || !("previewId" in prepared)) return;
      assert.match(prepared.executable, /^C:\\Windows\\(System32|Sysnative)\\cmd\.exe$/i);
      assert.match(prepared.shellWarning, /C:\\Windows\\System32\\reg\.exe/);
      assert.match(prepared.path, /node_modules\\?\.bin;C:\\Windows\\(System32|Sysnative);C:\\Windows/i);
      assert.equal(prepared.path.includes("D:\\evil"), false);
      assert.deepEqual(prepared.arguments, []);

      let token = "";
      setAgentExecutionRuntimeForTests({
        holdToken: (value) => {
          token = value;
        },
      });
      const held = await runTrustedPackageScriptConfirmation({
        previewId: prepared.previewId,
        projectRoot: repo,
        ownerId: 7,
        senderAllowed: true,
      });
      assert.equal(held.ok, true, !held.ok ? `${held.code} ${held.error}` : "");
      const ran = await executeApprovedPackageScript({
        payload: { token },
        projectRoot: repo,
        ownerId: 7,
        senderAllowed: true,
      });
      assert.equal(ran.ok, true, `${ran.code ?? ""} ${ran.stderr}`);
      assert.match(ran.stdout, /windows-package-script-ok/);
      const replay = await executeApprovedPackageScript({
        payload: { token },
        projectRoot: repo,
        ownerId: 7,
        senderAllowed: true,
      });
      assert.equal(replay.code, "approval_invalid");

      await writeFile(path.join(repo, ".npmrc"), "script-shell=C:\\evil\\cmd.exe\n", "utf8");
      const npmrc = await preparePackageScriptApproval({
        payload: { script: "test" },
        projectRoot: repo,
        ownerId: 7,
        senderAllowed: true,
      });
      assert.equal(npmrc.ok, false);
      if (!npmrc.ok) assert.equal(npmrc.code, "environment_not_allowed");
    } finally {
      for (const [key, value] of Object.entries(previous)) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      resetAgentExecutionRuntimeForTests();
    }
  });
});
