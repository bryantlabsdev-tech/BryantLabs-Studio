import assert from "node:assert/strict";
import * as fs from "node:fs/promises";
import * as net from "node:net";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { isPidAlive, isTcpPortInUse, waitForPidExit } from "../processTree.cjs";
import { getPreviewState, startPreview, stopPreview, stopPreviewAsync } from "./preview.cjs";
import { createQuitTeardownCoordinator } from "../quitTeardown.cjs";
import { prepareProjectSwitch } from "../projectActivate.cjs";
import { isActiveProjectRoot } from "../projectWriteCoordinator.cjs";

const SERVER_SCRIPT = `const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const portIdx = process.argv.indexOf("--port");
const port = Number(portIdx >= 0 ? process.argv[portIdx + 1] : 4173);
const pidFile = path.join(__dirname, "tree.pids");

const child = spawn(
  process.execPath,
  [
    "-e",
    [
      "const http = require('node:http');",
      "const server = http.createServer((_req, res) => {",
      "  res.writeHead(200, { 'content-type': 'text/html' });",
      "  res.end('<html>ok</html>');",
      "});",
      "server.listen(" + port + ", '127.0.0.1');",
      "setInterval(() => {}, 1e9);",
    ].join(""),
  ],
  { stdio: "ignore", detached: true },
);
if (!child.pid) process.exit(1);
fs.writeFileSync(
  pidFile,
  JSON.stringify({
    npm: process.ppid,
    server: process.pid,
    child: child.pid,
  }),
);
child.unref();
process.stdout.write("http://127.0.0.1:" + port + "/\\n");
setInterval(() => {}, 1e9);
`;

interface FixturePids {
  npm: number;
  server: number;
  child: number;
}

const HANG_SERVER = `const { spawn } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");

const portIdx = process.argv.indexOf("--port");
const port = Number(portIdx >= 0 ? process.argv[portIdx + 1] : 4173);
const pidFile = path.join(__dirname, "tree.pids");

process.on("SIGTERM", () => {});

const child = spawn(
  process.execPath,
  [
    "-e",
    [
      "process.on('SIGTERM', () => {});",
      "const http = require('node:http');",
      "const server = http.createServer((_req, res) => {",
      "  res.writeHead(200, { 'content-type': 'text/html' });",
      "  res.end('<html>ok</html>');",
      "});",
      "server.listen(" + port + ", '127.0.0.1');",
      "setInterval(() => {}, 1e9);",
    ].join(""),
  ],
  { stdio: "ignore", detached: true },
);
if (!child.pid) process.exit(1);
fs.writeFileSync(
  pidFile,
  JSON.stringify({
    npm: process.ppid,
    server: process.pid,
    child: child.pid,
  }),
);
child.unref();
process.stdout.write("http://127.0.0.1:" + port + "/\\n");
setInterval(() => {}, 1e9);
`;

async function writeHangPreviewFixture(): Promise<{
  root: string;
  pidFile: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-preview-hang-"));
  const pidFile = path.join(root, "tree.pids");
  await fs.mkdir(path.join(root, "dist"));
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "preview-hang-fixture",
      private: true,
      scripts: { preview: "node server.cjs" },
    }),
  );
  await fs.writeFile(path.join(root, "server.cjs"), HANG_SERVER);
  return { root, pidFile };
}

async function writePreviewFixture(): Promise<{
  root: string;
  pidFile: string;
}> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-preview-stop-"));
  const pidFile = path.join(root, "tree.pids");
  await fs.mkdir(path.join(root, "dist"));
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "preview-stop-fixture",
      private: true,
      scripts: { preview: "node server.cjs" },
    }),
  );
  await fs.writeFile(path.join(root, "server.cjs"), SERVER_SCRIPT);
  return { root, pidFile };
}

async function readFixturePids(
  pidFile: string,
  timeoutMs = 3_000,
): Promise<FixturePids> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const parsed = JSON.parse(await fs.readFile(pidFile, "utf8")) as FixturePids;
      if (
        Number.isInteger(parsed.child) &&
        parsed.child > 1 &&
        Number.isInteger(parsed.server) &&
        parsed.server > 1
      ) {
        return parsed;
      }
    } catch {
      /* not written yet */
    }
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error("preview fixture pids were never written");
}

async function bindPort(port: number): Promise<void> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

describe("preview stop tree", () => {
  it("kills a reparented descendant, frees the port, and is safe to call twice", async () => {
    const { root, pidFile } = await writePreviewFixture();
    const started = await startPreview(root);
    assert.equal(started.ok, true, started.error);
    const port = getPreviewState().port;
    const pids = await readFixturePids(pidFile);
    try {
      assert.equal(isPidAlive(pids.child), true);
      assert.equal(await isTcpPortInUse(port), true);

      try {
        process.kill(pids.server, "SIGKILL");
      } catch {
        /* already gone */
      }
      await waitForPidExit(pids.server, 1_000);
      assert.equal(isPidAlive(pids.child), true, "child should outlive its parent");

      await stopPreviewAsync();
      assert.equal(isPidAlive(pids.child), false, "reparented preview child survived stop");
      assert.equal(getPreviewState().running, false);
      assert.equal(await isTcpPortInUse(port), false);
      await bindPort(port);

      await stopPreviewAsync();
      stopPreview();
      await stopPreviewAsync();
      assert.equal(isPidAlive(pids.child), false);
      assert.equal(await isTcpPortInUse(port), false);
      await bindPort(port);
    } finally {
      await stopPreviewAsync();
      for (const pid of [pids.child, pids.server, pids.npm]) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }
  });

  it("synchronous stopPreview still terminates the tracked descendant tree", async () => {
    const { root, pidFile } = await writePreviewFixture();
    const started = await startPreview(root);
    assert.equal(started.ok, true, started.error);
    const port = getPreviewState().port;
    const pids = await readFixturePids(pidFile);
    try {
      assert.equal(isPidAlive(pids.child), true);

      stopPreview();
      await stopPreviewAsync();

      assert.equal(isPidAlive(pids.child), false, "sync stop left a descendant alive");
      assert.equal(getPreviewState().running, false);
      assert.equal(await isTcpPortInUse(port), false);
      await bindPort(port);
      await stopPreviewAsync();
    } finally {
      await stopPreviewAsync();
      for (const pid of [pids.child, pids.server, pids.npm]) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }
  });

  it("quit teardown escalates a hung preview tree and frees its port", async () => {
    const { root, pidFile } = await writeHangPreviewFixture();
    const started = await startPreview(root);
    assert.equal(started.ok, true, started.error);
    const port = getPreviewState().port;
    const pids = await readFixturePids(pidFile);
    let resumeCalls = 0;
    let terminalsDestroyed = 0;
    try {
      assert.equal(isPidAlive(pids.child), true);
      assert.equal(await isTcpPortInUse(port), true);

      const coordinator = createQuitTeardownCoordinator({
        stopPreviewAsync,
        destroyAllTerminals: () => {
          terminalsDestroyed += 1;
        },
        quit: () => {
          resumeCalls += 1;
        },
      });
      const event = {
        prevented: 0,
        preventDefault() {
          this.prevented += 1;
        },
      };
      coordinator.intercept(event);
      assert.equal(event.prevented, 1);
      await coordinator.whenSettled();

      assert.equal(resumeCalls, 1);
      assert.equal(terminalsDestroyed, 1);
      assert.equal(isPidAlive(pids.child), false);
      assert.equal(isPidAlive(pids.server), false);
      assert.equal(getPreviewState().running, false);
      assert.equal(await isTcpPortInUse(port), false);
      await bindPort(port);
    } finally {
      await stopPreviewAsync();
      for (const pid of [pids.child, pids.server, pids.npm]) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }
  });

  it("prepareProjectSwitch({ awaitPreviewStop: true }) waits until the tracked tree is gone", async () => {
    const { root, pidFile } = await writePreviewFixture();
    const nextRoot = await fs.mkdtemp(path.join(os.tmpdir(), "bl-preview-switch-"));
    const started = await startPreview(root);
    assert.equal(started.ok, true, started.error);
    const port = getPreviewState().port;
    const pids = await readFixturePids(pidFile);
    try {
      assert.equal(isPidAlive(pids.child), true);
      let nextActiveWhilePreviewAlive = false;
      const poll = setInterval(() => {
        if (isActiveProjectRoot(nextRoot) && isPidAlive(pids.child)) {
          nextActiveWhilePreviewAlive = true;
        }
      }, 5);
      await prepareProjectSwitch(nextRoot, { awaitPreviewStop: true });
      clearInterval(poll);
      assert.equal(nextActiveWhilePreviewAlive, false);
      assert.equal(isPidAlive(pids.child), false);
      assert.equal(getPreviewState().running, false);
      assert.equal(await isTcpPortInUse(port), false);
      assert.equal(isActiveProjectRoot(nextRoot), true);
      await bindPort(port);
    } finally {
      await stopPreviewAsync();
      for (const pid of [pids.child, pids.server, pids.npm]) {
        try {
          process.kill(pid, "SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }
  });
});
