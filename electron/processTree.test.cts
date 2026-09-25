import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import * as net from "node:net";
import { describe, it } from "node:test";
import {
  collectProcessTree,
  isPidAlive,
  isTcpPortInUse,
  terminateProcessTree,
  terminateTrackedPids,
  waitForPidExit,
} from "./processTree.cjs";

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
        /* ignore */
      }
    },
  };
}

const HANG = "setInterval(() => {}, 1e9)";

async function listenOnEphemeralPort(): Promise<{
  port: number;
  close: () => Promise<void>;
}> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  const address = server.address();
  if (!address || typeof address === "string") {
    server.close();
    throw new Error("failed to bind ephemeral port");
  }
  return {
    port: address.port,
    close: () =>
      new Promise((resolve) => {
        server.close(() => resolve());
      }),
  };
}

describe("processTree", () => {
  it("terminates a child that outlives and reparents after its parent exits", async () => {
    const parent = spawnHang(`
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', ${JSON.stringify(HANG)}], {
        stdio: 'ignore',
        detached: true,
      });
      if (!child.pid) process.exit(1);
      child.unref();
      setInterval(() => {}, 1e9);
    `);
    try {
      await new Promise((r) => setTimeout(r, 80));
      const tree = collectProcessTree(parent.pid);
      const childPid = tree.find((pid) => pid !== parent.pid);
      assert.ok(childPid, `expected descendant, got ${tree.join(",")}`);

      try {
        process.kill(parent.pid, "SIGKILL");
      } catch {
        /* ignore */
      }
      await waitForPidExit(parent.pid, 1_000);
      assert.equal(isPidAlive(parent.pid), false);
      assert.equal(isPidAlive(childPid), true, "child should survive parent exit");

      await terminateTrackedPids(tree, { termGraceMs: 80 });
      assert.equal(isPidAlive(childPid), false, "reparented child survived");
    } finally {
      parent.kill();
    }
  });

  it("releases a port held by a descendant so it can be rebound", async () => {
    const holder = await listenOnEphemeralPort();
    const port = holder.port;
    await holder.close();

    const parent = spawnHang(`
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', ${JSON.stringify(`
        const net = require('node:net');
        const server = net.createServer();
        server.listen(${port}, '127.0.0.1');
        setInterval(() => {}, 1e9);
      `)}], { stdio: 'ignore', detached: true });
      if (!child.pid) process.exit(1);
      child.unref();
      setInterval(() => {}, 1e9);
    `);
    try {
      const started = Date.now();
      while (!(await isTcpPortInUse(port))) {
        if (Date.now() - started > 2_000) {
          throw new Error(`child never listened on ${port}`);
        }
        await new Promise((r) => setTimeout(r, 20));
      }

      const tree = collectProcessTree(parent.pid);
      assert.ok(tree.length >= 2, `expected descendant, got ${tree.join(",")}`);
      await terminateTrackedPids(tree, { termGraceMs: 80 });

      assert.equal(await isTcpPortInUse(port), false);
      const server = net.createServer();
      await new Promise<void>((resolve, reject) => {
        server.once("error", reject);
        server.listen(port, "127.0.0.1", () => resolve());
      });
      await new Promise<void>((resolve) => server.close(() => resolve()));
    } finally {
      parent.kill();
    }
  });

  it("kills a grandchild that ignores SIGTERM", async () => {
    const parent = spawnHang(`
      const { spawn } = require('node:child_process');
      const child = spawn(process.execPath, ['-e', ${JSON.stringify(`
        try { process.on('SIGTERM', () => {}); } catch {}
        setInterval(() => {}, 1e9);
      `)}], { stdio: 'inherit' });
      if (!child.pid) process.exit(1);
      setInterval(() => {}, 1e9);
    `);
    try {
      await new Promise((r) => setTimeout(r, 80));
      const tree = collectProcessTree(parent.pid);
      const childPid = tree.find((pid) => pid !== parent.pid);
      assert.ok(childPid, `expected descendant, got ${tree.join(",")}`);
      await terminateTrackedPids(tree, { termGraceMs: 50 });
      assert.equal(isPidAlive(childPid), false, "SIGTERM-ignoring grandchild survived SIGKILL");
    } finally {
      parent.kill();
    }
  });

  it("is safe to terminate an already-exited tree more than once", async () => {
    const child = spawn(process.execPath, ["-e", "process.exit(0)"], {
      stdio: "ignore",
    });
    const pid = child.pid;
    assert.ok(pid);
    await waitForPidExit(pid, 2_000);
    assert.equal(isPidAlive(pid), false);
    await terminateProcessTree(pid, { termGraceMs: 20 });
    await terminateProcessTree(pid, { termGraceMs: 20 });
    await terminateTrackedPids([pid], { termGraceMs: 20 });
  });
});
