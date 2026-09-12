import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { describe, it } from "node:test";
import {
  collectProcessTree,
  isPidAlive,
  teardownStudioApp,
  terminateProcessTree,
  waitForPidExit,
} from "./processTeardown.ts";

function spawnHang(script: string): { pid: number; kill: () => void } {
  const child = spawn(process.execPath, ["-e", script], {
    stdio: "ignore",
  });
  if (child.pid == null) throw new Error("spawn failed");
  return {
    pid: child.pid,
    kill: () => {
      try {
        child.kill("SIGKILL");
      } catch {
        // ignore
      }
    },
  };
}

const HANG = "setInterval(() => {}, 1e9)";
const IGNORE_TERM = "process.on('SIGTERM', () => {}); setInterval(() => {}, 1e9)";

describe("e2e process teardown", () => {
  it("terminates a live process tree including descendants", async () => {
    const parent = spawnHang(`
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', ${JSON.stringify(HANG)}], { stdio: 'ignore' });
      if (!child.pid) process.exit(1);
      setInterval(() => {}, 1e9);
    `);
    try {
      await new Promise((r) => setTimeout(r, 80));
      const tree = collectProcessTree(parent.pid);
      assert.ok(tree.includes(parent.pid));
      assert.ok(tree.length >= 2, `expected descendant, got ${tree.join(",")}`);
      await terminateProcessTree(parent.pid, { termGraceMs: 80 });
      assert.equal(isPidAlive(parent.pid), false);
      for (const pid of tree) {
        assert.equal(isPidAlive(pid), false, `pid ${pid} still alive`);
      }
    } finally {
      parent.kill();
    }
  });

  it("is a no-op for already-exited processes and can be called twice", async () => {
    const child = spawn(process.execPath, ["-e", "process.exit(0)"], { stdio: "ignore" });
    const pid = child.pid;
    assert.ok(pid);
    await waitForPidExit(pid, 2_000);
    assert.equal(isPidAlive(pid), false);
    await terminateProcessTree(pid, { termGraceMs: 20 });
    await terminateProcessTree(pid, { termGraceMs: 20 });
  });

  it("SIGKILLs a process that ignores SIGTERM after the grace period", async () => {
    const stubborn = spawnHang(IGNORE_TERM);
    try {
      assert.equal(isPidAlive(stubborn.pid), true);
      const started = Date.now();
      await terminateProcessTree(stubborn.pid, { termGraceMs: 80 });
      assert.equal(isPidAlive(stubborn.pid), false);
      assert.ok(Date.now() - started < 2_000);
    } finally {
      stubborn.kill();
    }
  });

  it("teardownStudioApp snapshots descendants so orphans are still killed", async () => {
    const parent = spawnHang(`
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', ${JSON.stringify(IGNORE_TERM)}], { stdio: 'ignore' });
      if (!child.pid) process.exit(1);
      setInterval(() => {}, 1e9);
    `);
    try {
      await new Promise((r) => setTimeout(r, 80));
      const tree = collectProcessTree(parent.pid);
      assert.ok(tree.length >= 2);
      const childPid = tree.find((pid) => pid !== parent.pid);
      assert.ok(childPid);

      let closeCalls = 0;
      const fakeApp = {
        close: async () => {
          closeCalls += 1;
          try {
            process.kill(parent.pid, "SIGKILL");
          } catch {
            // ignore
          }
          await waitForPidExit(parent.pid, 1_000);
        },
        process: () => ({ pid: parent.pid }),
      };

      await teardownStudioApp(fakeApp, { closeGraceMs: 1_000, termGraceMs: 80 });
      assert.equal(closeCalls, 1);
      assert.equal(isPidAlive(parent.pid), false);
      assert.equal(isPidAlive(childPid), false);
      await teardownStudioApp(fakeApp, { closeGraceMs: 20, termGraceMs: 20 });
      assert.equal(closeCalls, 1);
    } finally {
      parent.kill();
    }
  });
});
