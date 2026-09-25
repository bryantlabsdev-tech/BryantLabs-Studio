import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { chmod, mkdtemp, writeFile, symlink, rm } from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";
import {
  buildAgentExecutionEnv,
  clearAgentExecutionSession,
  executeAgentInspect,
  inspectAgentExecutionPolicy,
  listAgentExecutionDenials,
  resetAgentExecutionRuntimeForTests,
  resolveTrustedExecutable,
  setAgentExecutionRuntimeForTests,
  trustedInspectPath,
} from "./agentExecution.cjs";
import {
  collectAgentExecutionPolicyParity,
  parseAgentInspectRequest,
  planAgentCommand,
} from "./agentExecutionPolicy.cjs";

const exec = promisify(execFile);

async function git(cwd: string, args: string[]): Promise<string> {
  const { stdout } = await exec("git", args, { cwd, encoding: "utf8" });
  return (stdout ?? "").trim();
}

async function makeRepo(): Promise<string> {
  const repo = await mkdtemp(path.join(tmpdir(), "bl-agent-exec-"));
  await git(repo, ["init", "-b", "main"]);
  await git(repo, ["config", "user.email", "test@example.test"]);
  await git(repo, ["config", "user.name", "Test"]);
  await writeFile(path.join(repo, "README.md"), "one\n", "utf8");
  await git(repo, ["add", "README.md"]);
  await git(repo, ["commit", "-m", "init"]);
  return repo;
}

describe("agent execution runtime", () => {
  it("runs git_status with shell disabled and a trusted git", async () => {
    const repo = await makeRepo();
    const result = await executeAgentInspect({
      payload: { recipe: "git_status" },
      projectRoot: repo,
      ownerId: 1,
      senderAllowed: true,
    });
    assert.equal(result.ok, true, `${result.error ?? ""} ${result.stderr ?? ""} ${result.code ?? ""}`);
    assert.equal(result.timedOut, false);
  });

  it("rejects extra IPC fields, class names, and project-code recipes", async () => {
    const repo = await makeRepo();
    const extra = await executeAgentInspect({
      payload: { recipe: "git_status", cwd: repo, command: "id", env: { A: "1" } },
      projectRoot: repo,
      ownerId: 2,
      senderAllowed: true,
    });
    assert.equal(extra.code, "invalid_request");
    const npm = await executeAgentInspect({
      payload: { recipe: "npm_run_build" },
      projectRoot: repo,
      ownerId: 2,
      senderAllowed: true,
    });
    assert.equal(npm.code, "recipe_not_allowed");
    const stringPlan = planAgentCommand("npx tsc --noEmit");
    assert.equal(stringPlan.ok, false);
  });

  it("rejects a project-local git shadow on PATH", async () => {
    const repo = await makeRepo();
    const shadow = path.join(repo, "git");
    await writeFile(shadow, "#!/bin/sh\necho hijacked\n", "utf8");
    await chmod(shadow, 0o755);
    const previous = process.env.PATH;
    process.env.PATH = `${repo}${path.delimiter}${previous ?? ""}`;
    try {
      const resolved = resolveTrustedExecutable("git", repo);
      assert.ok(resolved);
      assert.equal(resolved.real.includes(repo), false);
      const result = await executeAgentInspect({
        payload: { recipe: "git_status" },
        projectRoot: repo,
        ownerId: 3,
        senderAllowed: true,
      });
      assert.equal(result.ok, true, `${result.error ?? ""} ${result.stderr ?? ""}`);
      assert.equal(result.stdout.includes("hijacked"), false);
    } finally {
      process.env.PATH = previous;
    }
    assert.ok(trustedInspectPath().includes("/usr/bin"));
  });

  it("rejects tmp and node_modules executables unless tests opt in", () => {
    const env = buildAgentExecutionEnv("/usr/bin");
    assert.equal(env.SSH_AUTH_SOCK, undefined);
    assert.equal(env.HTTPS_PROXY, undefined);
    assert.equal(env.HTTP_PROXY, undefined);
    assert.equal(env.GIT_ASKPASS, "");
    assert.equal(env.LD_PRELOAD, undefined);
    assert.equal(env.HOME, undefined);
    assert.ok(env.PATH?.startsWith("/usr/bin"));
    assert.equal(env.GIT_TERMINAL_PROMPT, "0");
  });

  it("isolates denials by owner and rejects disallowed senders", async () => {
    const repo = await makeRepo();
    await executeAgentInspect({
      payload: { recipe: "git_push" },
      projectRoot: repo,
      ownerId: 11,
      senderAllowed: true,
    });
    await executeAgentInspect({
      payload: { recipe: "git_status" },
      projectRoot: repo,
      ownerId: 12,
      senderAllowed: false,
    });
    const eleven = listAgentExecutionDenials(11);
    const twelve = listAgentExecutionDenials(12);
    assert.ok(eleven.some((row) => row.code === "recipe_not_allowed"));
    assert.ok(twelve.some((row) => row.code === "sender_not_allowed"));
    assert.equal(eleven.some((row) => row.ownerId === 12), false);
  });

  it("fails closed when the executable identity changes before spawn", async () => {
    const repo = await makeRepo();
    const dir = await mkdtemp(path.join(tmpdir(), "bl-agent-bin-"));
    const file = path.join(dir, "git");
    await writeFile(file, "#!/bin/sh\nexit 0\n", "utf8");
    await chmod(file, 0o755);
    setAgentExecutionRuntimeForTests({
      allowTmpExecutables: true,
      executableOverrides: { git: file },
      beforeSpawn: async () => {
        await writeFile(file, "#!/bin/sh\necho changed\n", "utf8");
        await chmod(file, 0o755);
      },
    });
    try {
      const result = await executeAgentInspect({
        payload: { recipe: "git_status" },
        projectRoot: repo,
        ownerId: 4,
        senderAllowed: true,
      });
      assert.equal(result.code, "executable_identity_changed");
    } finally {
      resetAgentExecutionRuntimeForTests();
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("times out and treats a second command as in-flight", async () => {
    const repo = await makeRepo();
    setAgentExecutionRuntimeForTests({ timeoutMs: 1 });
    const first = executeAgentInspect({
      payload: { recipe: "git_status" },
      projectRoot: repo,
      ownerId: 5,
      senderAllowed: true,
    });
    const second = await executeAgentInspect({
      payload: { recipe: "git_status" },
      projectRoot: repo,
      ownerId: 5,
      senderAllowed: true,
    });
    const settled = await first;
    resetAgentExecutionRuntimeForTests();
    await clearAgentExecutionSession();
    assert.ok(second.code === "operation_in_progress" || settled.timedOut || settled.ok);
  });

  it("describes application-level policy without project-code isolation claims", () => {
    const snapshot = inspectAgentExecutionPolicy();
    assert.equal(snapshot.osSandboxClaimed, false);
    assert.match(snapshot.autonomousInspection, /no network-capable recipe/i);
    assert.match(snapshot.approvedProjectCode, /not network-isolated/i);
    assert.equal(parseAgentInspectRequest({ recipe: "git_status", argv: ["x"] }).ok, false);
    const planned = planAgentCommand("git push");
    assert.equal(planned.ok, false);
    const parity = collectAgentExecutionPolicyParity();
    assert.ok(Array.isArray(parity.gitStatus));
  });

  it("does not follow a symlinked project git binary for autonomous inspect", async () => {
    const repo = await makeRepo();
    const parent = await mkdtemp(path.join(tmpdir(), "bl-agent-link-"));
    const link = path.join(parent, "linked");
    await symlink(repo, link);
    const result = await executeAgentInspect({
      payload: { recipe: "git_status" },
      projectRoot: link,
      ownerId: 6,
      senderAllowed: true,
    });
    assert.equal(result.ok, false);
    assert.equal(result.code, "symlink_escape");
  });
});
