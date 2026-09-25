import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { execFile, execFileSync } from "node:child_process";
import { promisify } from "node:util";
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readdir, readFile, rm, symlink, writeFile } from "node:fs/promises";
import * as path from "node:path";
import { tmpdir } from "node:os";
import {
  buildAgentExecutionEnv,
  approveProjectCodePreview,
  cancelProjectCodeApproval,
  clearAgentExecutionSession,
  executeAgentInspect,
  executeApprovedProjectCode,
  inspectAgentExecutionPolicy,
  listAgentExecutionApprovals,
  listAgentExecutionDenials,
  prepareProjectCodeApproval,
  recoverProjectCodeSnapshots,
  rejectRendererProjectCodeRedemption,
  runTrustedProjectCodeConfirmation,
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

async function replaceSealedSnapshot(target: string, contents: string): Promise<void> {
  const writeReplacement = async () => {
    await chmod(target, 0o600);
    await writeFile(target, contents, "utf8");
  };
  try {
    await writeReplacement();
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: string }).code) : "";
    if (code !== "EPERM" || !existsSync("/usr/bin/chflags")) throw error;
    execFileSync("/usr/bin/chflags", ["nouchg", target]);
    await writeReplacement();
  }
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

describe("approval-gated project code", () => {
  let snapshotRoot = "";

  async function useSnapshotRoot(): Promise<void> {
    if (!snapshotRoot) snapshotRoot = await mkdtemp(path.join(tmpdir(), "bl-agent-snapshots-"));
    setAgentExecutionRuntimeForTests({ snapshotRoot });
  }

  async function writeScript(repo: string, name: string, body: string): Promise<string> {
    const dir = path.join(repo, "scripts");
    await mkdir(dir, { recursive: true });
    const file = path.join(dir, name);
    await writeFile(file, body, "utf8");
    return `scripts/${name}`;
  }

  async function previewIdFor(repo: string, script: string, ownerId: number): Promise<string> {
    await useSnapshotRoot();
    setAgentExecutionRuntimeForTests({
      executableOverrides: { node: process.execPath },
      trustedDecision: async () => "approve",
    });
    const preview = await prepareProjectCodeApproval({
      payload: { script },
      projectRoot: repo,
      ownerId,
      senderAllowed: true,
    });
    assert.equal(preview.ok, true);
    if (!preview.ok || !("previewId" in preview)) throw new Error("preview failed");
    return preview.previewId;
  }

  async function heldToken(repo: string, script: string, ownerId = 7): Promise<string> {
    const previewId = await previewIdFor(repo, script, ownerId);
    let token = "";
    setAgentExecutionRuntimeForTests({
      holdToken: (value) => {
        token = value;
      },
    });
    const held = await runTrustedProjectCodeConfirmation({
      previewId,
      projectRoot: repo,
      ownerId,
      senderAllowed: true,
    });
    assert.equal(held.ok, true);
    assert.equal("held" in held && held.held, true);
    assert.equal(token.length, 32);
    setAgentExecutionRuntimeForTests({ holdToken: undefined });
    return token;
  }

  it("runs a confirmed node script and rejects replay", async () => {
    const repo = await makeRepo();
    const script = await writeScript(repo, "hello.js", "process.stdout.write('approved-ok\\n');\n");
    const token = await heldToken(repo, script);
    const ran = await executeApprovedProjectCode({
      payload: { token },
      projectRoot: repo,
      ownerId: 7,
      senderAllowed: true,
    });
    assert.equal(ran.ok, true, `${ran.code ?? ""} ${ran.error ?? ""} ${ran.stderr}`);
    assert.equal(ran.stdout.includes("approved-ok"), true);
    const replay = await executeApprovedProjectCode({
      payload: { token },
      projectRoot: repo,
      ownerId: 7,
      senderAllowed: true,
    });
    assert.equal(replay.code, "approval_invalid");
    const approvals = listAgentExecutionApprovals(7);
    assert.ok(approvals.some((row) => row.outcome === "approved"));
    assert.equal(JSON.stringify(approvals).includes("approved-ok"), false);
  });

  it("rejects expiry, mutation, cross-window, project switch, and command substitution", async () => {
    const repo = await makeRepo();
    const other = await makeRepo();
    const script = await writeScript(repo, "hello.js", "process.stdout.write('ran\\n');\n");
    const marker = path.join(repo, "ran.txt");

    await useSnapshotRoot();
    setAgentExecutionRuntimeForTests({
      now: 1_000_000,
      approvalTtlMs: 1_000,
      executableOverrides: { node: process.execPath },
    });
    try {
      const preview = await prepareProjectCodeApproval({
        payload: { script },
        projectRoot: repo,
        ownerId: 8,
        senderAllowed: true,
      });
      assert.equal(preview.ok, true);
      if (!preview.ok || !("previewId" in preview)) return;
      setAgentExecutionRuntimeForTests({ now: 1_002_000, trustedDecision: async () => "approve" });
      const expired = await runTrustedProjectCodeConfirmation({
        previewId: preview.previewId,
        projectRoot: repo,
        ownerId: 8,
        senderAllowed: true,
      });
      assert.equal(expired.ok, false);
      if (expired.ok) return;
      assert.equal(expired.code, "approval_expired");
    } finally {
      resetAgentExecutionRuntimeForTests();
    }

    const token = await heldToken(repo, script, 8);
    const mutated = await executeApprovedProjectCode({
      payload: { token, script: "scripts/other.js", argv: ["$(id)"] },
      projectRoot: repo,
      ownerId: 8,
      senderAllowed: true,
    });
    assert.equal(mutated.code, "approval_invalid");
    const retried = await executeApprovedProjectCode({
      payload: { token },
      projectRoot: repo,
      ownerId: 8,
      senderAllowed: true,
    });
    assert.equal(retried.code, "approval_invalid");

    const cross = await heldToken(repo, script, 8);
    const otherWindow = await executeApprovedProjectCode({
      payload: { token: cross },
      projectRoot: repo,
      ownerId: 9,
      senderAllowed: true,
    });
    assert.equal(otherWindow.code, "approval_invalid");

    const switched = await heldToken(repo, script, 8);
    await clearAgentExecutionSession();
    const afterSwitch = await executeApprovedProjectCode({
      payload: { token: switched },
      projectRoot: other,
      ownerId: 8,
      senderAllowed: true,
    });
    assert.equal(afterSwitch.ok, false);
    assert.ok(afterSwitch.code === "project_changed" || afterSwitch.code === "approval_invalid");

    const substitution = await prepareProjectCodeApproval({
      payload: { script: "scripts/hello.js", args: ["$(id)"] },
      projectRoot: repo,
      ownerId: 8,
      senderAllowed: true,
    });
    assert.equal(substitution.ok, false);
    if (!substitution.ok) assert.equal(substitution.code, "arguments_not_allowed");
    await readFile(marker, "utf8").then(
      () => assert.fail("marker should not exist"),
      () => undefined,
    );
  });

  it("cancels a preview and terminates an approved run", async () => {
    const repo = await makeRepo();
    const script = await writeScript(
      repo,
      "sleep.js",
      "setInterval(() => { process.stdout.write('tick\\n'); }, 50);\n",
    );
    setAgentExecutionRuntimeForTests({ executableOverrides: { node: process.execPath } });
    const preview = await prepareProjectCodeApproval({
      payload: { script },
      projectRoot: repo,
      ownerId: 10,
      senderAllowed: true,
    });
    assert.equal(preview.ok, true);
    if (!preview.ok || !("previewId" in preview)) return;
    assert.match(preview.networkLimitation, /not an OS, network, filesystem, container, or VM sandbox/);
    assert.match(preview.risk, /access files and the network/);
    const cancelled = await cancelProjectCodeApproval({
      previewId: preview.previewId,
      ownerId: 10,
      senderAllowed: true,
    });
    assert.equal(cancelled.ok, true);
    const afterCancel = await approveProjectCodePreview({
      previewId: preview.previewId,
      projectRoot: repo,
      ownerId: 10,
      senderAllowed: true,
    });
    assert.equal(afterCancel.ok, false);

    const token = await heldToken(repo, script, 10);
    const running = executeApprovedProjectCode({
      payload: { token },
      projectRoot: repo,
      ownerId: 10,
      senderAllowed: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    await cancelProjectCodeApproval({ token, ownerId: 10, senderAllowed: true });
    const settled = await running;
    assert.equal(settled.ok, false);
    assert.equal(settled.code, "cancelled");
    await clearAgentExecutionSession();
    assert.deepEqual(await readdir(snapshotRoot), []);
    resetAgentExecutionRuntimeForTests();
  });

  it("runs the approved bytes after the project script changes", async () => {
    const repo = await makeRepo();
    const script = await writeScript(repo, "hello.js", "process.stdout.write('original\\n');\n");
    const file = path.join(repo, "scripts", "hello.js");
    const mutations: Array<{ readonly name: string; readonly apply: () => Promise<void> }> = [
      {
        name: "content",
        apply: async () => {
          await writeFile(file, "process.stdout.write('mutated\\n');\n", "utf8");
        },
      },
      {
        name: "inode",
        apply: async () => {
          await rm(file);
          await writeFile(file, "process.stdout.write('original\\n');\n", "utf8");
        },
      },
      {
        name: "symlink",
        apply: async () => {
          const other = path.join(repo, "scripts", "other.js");
          await writeFile(other, "process.stdout.write('other\\n');\n", "utf8");
          await rm(file);
          await symlink(other, file);
        },
      },
    ];
    for (const mutation of mutations) {
      await rm(file, { force: true });
      await writeFile(file, "process.stdout.write('original\\n');\n", "utf8");
      const token = await heldToken(repo, script, 21);
      setAgentExecutionRuntimeForTests({ afterSeal: mutation.apply });
      const ran = await executeApprovedProjectCode({
        payload: { token },
        projectRoot: repo,
        ownerId: 21,
        senderAllowed: true,
      });
      assert.equal(ran.ok, true, `${mutation.name} ${ran.code ?? ""} ${ran.stderr}`);
      assert.equal(ran.stdout.includes("original"), true, mutation.name);
      assert.equal(ran.stdout.includes("mutated") || ran.stdout.includes("other"), false);
      assert.deepEqual(await readdir(snapshotRoot), []);
      resetAgentExecutionRuntimeForTests();
    }
  });

  it("rejects untrusted approval, duplicate confirmation, and concurrent redemption", async () => {
    const repo = await makeRepo();
    const other = await makeRepo();
    const script = await writeScript(repo, "hello.js", "process.stdout.write('once\\n');\n");
    const previewId = await previewIdFor(repo, script, 22);
    const direct = await approveProjectCodePreview({
      previewId,
      projectRoot: repo,
      ownerId: 22,
      senderAllowed: true,
    });
    assert.equal(direct.code, "approval_invalid");
    const ran = await runTrustedProjectCodeConfirmation({
      previewId,
      projectRoot: repo,
      ownerId: 22,
      senderAllowed: true,
    });
    assert.equal(ran.ok, true, `${"code" in ran ? ran.code : ""}`);

    const againId = await previewIdFor(repo, script, 22);
    const first = runTrustedProjectCodeConfirmation({
      previewId: againId,
      projectRoot: repo,
      ownerId: 22,
      senderAllowed: true,
    });
    const second = await runTrustedProjectCodeConfirmation({
      previewId: againId,
      projectRoot: repo,
      ownerId: 22,
      senderAllowed: true,
    });
    const settled = await first;
    assert.equal("code" in second ? second.code : "", "approval_invalid");
    assert.equal(settled.ok, true);

    const token = await heldToken(repo, script, 22);
    const burned = await rejectRendererProjectCodeRedemption({
      payload: { token, script: "scripts/other.js" },
      ownerId: 22,
      senderAllowed: true,
    });
    assert.equal(burned.code, "approval_invalid");
    const afterBurn = await executeApprovedProjectCode({
      payload: { token },
      projectRoot: repo,
      ownerId: 22,
      senderAllowed: true,
    });
    assert.equal(afterBurn.code, "approval_invalid");

    const concurrentToken = await heldToken(repo, script, 22);
    const pair = await Promise.all([
      executeApprovedProjectCode({
        payload: { token: concurrentToken },
        projectRoot: repo,
        ownerId: 22,
        senderAllowed: true,
      }),
      executeApprovedProjectCode({
        payload: { token: concurrentToken },
        projectRoot: repo,
        ownerId: 22,
        senderAllowed: true,
      }),
    ]);
    assert.equal(pair.filter((row) => row.ok).length, 1);
    assert.equal(pair.filter((row) => row.code === "approval_invalid").length, 1);

    const windowId = await previewIdFor(repo, script, 22);
    const otherWindow = await runTrustedProjectCodeConfirmation({
      previewId: windowId,
      projectRoot: repo,
      ownerId: 23,
      senderAllowed: true,
    });
    assert.equal(otherWindow.ok, false);
    if (!otherWindow.ok) assert.equal(otherWindow.code, "approval_invalid");

    const projectId = await previewIdFor(repo, script, 22);
    const otherProject = await runTrustedProjectCodeConfirmation({
      previewId: projectId,
      projectRoot: other,
      ownerId: 22,
      senderAllowed: true,
    });
    assert.equal(otherProject.ok, false);
    if (!otherProject.ok) assert.equal(otherProject.code, "project_changed");

    const epochId = await previewIdFor(repo, script, 22);
    setAgentExecutionRuntimeForTests({
      trustedDecision: async () => {
        await clearAgentExecutionSession();
        return "approve";
      },
    });
    const during = await runTrustedProjectCodeConfirmation({
      previewId: epochId,
      projectRoot: repo,
      ownerId: 22,
      senderAllowed: true,
    });
    assert.equal(during.ok, false);
    if (!during.ok) assert.equal(during.code, "project_changed");
    resetAgentExecutionRuntimeForTests();
  });

  it("fails closed if the snapshot changes and cleans every exit", async () => {
    const repo = await makeRepo();
    const script = await writeScript(repo, "hello.js", "process.stdout.write('original\\n');\n");
    const token = await heldToken(repo, script, 30);
    setAgentExecutionRuntimeForTests({
      beforeSpawn: async () => {
        const names = await readdir(snapshotRoot);
        const target = path.join(snapshotRoot, names[0] ?? "");
        await replaceSealedSnapshot(target, "process.stdout.write('replaced\\n');\n");
      },
    });
    const tampered = await executeApprovedProjectCode({
      payload: { token },
      projectRoot: repo,
      ownerId: 30,
      senderAllowed: true,
    });
    assert.equal(tampered.code, "script_identity_changed");
    assert.equal(tampered.stdout.includes("replaced"), false);
    assert.deepEqual(await readdir(snapshotRoot), []);

    const timeoutScript = await writeScript(repo, "sleep.js", "setInterval(() => {}, 1000);\n");
    setAgentExecutionRuntimeForTests({
      beforeSpawn: undefined,
      afterSeal: undefined,
      timeoutMs: 40,
      executableOverrides: { node: process.execPath },
    });
    const timeoutId = await previewIdFor(repo, timeoutScript, 30);
    const timed = await runTrustedProjectCodeConfirmation({
      previewId: timeoutId,
      projectRoot: repo,
      ownerId: 30,
      senderAllowed: true,
    });
    assert.equal(timed.ok, false);
    if (!timed.ok) assert.equal(timed.code, "timeout");
    assert.deepEqual(await readdir(snapshotRoot), []);

    const loud = await writeScript(repo, "loud.js", "process.stdout.write('x'.repeat(1000));\n");
    setAgentExecutionRuntimeForTests({ maxOutputChars: 8, timeoutMs: 5_000 });
    const loudId = await previewIdFor(repo, loud, 30);
    const limited = await runTrustedProjectCodeConfirmation({
      previewId: loudId,
      projectRoot: repo,
      ownerId: 30,
      senderAllowed: true,
    });
    assert.equal(limited.ok, false);
    if (!limited.ok) assert.equal(limited.code, "output_limit");
    assert.deepEqual(await readdir(snapshotRoot), []);

    setAgentExecutionRuntimeForTests({ timeoutMs: 5_000 });
    const switchId = await previewIdFor(repo, timeoutScript, 30);
    const running = runTrustedProjectCodeConfirmation({
      previewId: switchId,
      projectRoot: repo,
      ownerId: 30,
      senderAllowed: true,
    });
    await new Promise((resolve) => setTimeout(resolve, 30));
    await clearAgentExecutionSession();
    const switched = await running;
    assert.equal(switched.ok, false);
    if (!switched.ok) assert.equal(switched.code, "project_changed");
    assert.deepEqual(await readdir(snapshotRoot), []);

    await writeFile(path.join(snapshotRoot, "leftover.js"), "process.stdout.write('no\\n');\n", "utf8");
    await useSnapshotRoot();
    await recoverProjectCodeSnapshots();
    assert.deepEqual(await readdir(snapshotRoot), []);
    resetAgentExecutionRuntimeForTests();
  });
});
