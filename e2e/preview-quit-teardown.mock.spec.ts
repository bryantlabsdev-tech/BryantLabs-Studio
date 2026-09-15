import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import {
  getMainWindow,
  launchStudioApp,
  openExistingProjectAt,
  waitForStudioTestHooks,
} from "./helpers/studio";
import {
  isPidAlive,
  waitForPidExit,
} from "./helpers/processTeardown.ts";

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

async function writePreviewProject(): Promise<{ root: string; pidFile: string }> {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "bl-e2e-preview-"));
  const pidFile = path.join(root, "tree.pids");
  await fs.mkdir(path.join(root, "dist"));
  await fs.writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "e2e-preview-teardown",
      private: true,
      scripts: { preview: "node server.cjs" },
    }),
  );
  await fs.writeFile(path.join(root, "server.cjs"), SERVER_SCRIPT);
  return { root, pidFile };
}

async function readFixturePids(
  pidFile: string,
  timeoutMs = 8_000,
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
    await new Promise((r) => setTimeout(r, 50));
  }
  throw new Error("preview fixture pids were never written");
}

async function startFixturePreview(
  page: Page,
  root: string,
): Promise<{ url: string; port: number }> {
  const result = await page.evaluate(async (target) => {
    const api = window.bryantlabs;
    if (!api?.greenfieldPreviewStart) return { ok: false, error: "no api" };
    return api.greenfieldPreviewStart(target);
  }, root);
  expect(result && "ok" in result ? result.ok : false).toBeTruthy();
  const url =
    result && "url" in result && typeof result.url === "string" ? result.url : "";
  expect(url).toBeTruthy();
  const port = Number(new URL(url).port);
  expect(Number.isInteger(port) && port > 0).toBeTruthy();
  return { url, port };
}

async function bindPort(port: number): Promise<void> {
  const server = net.createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  await new Promise<void>((resolve) => server.close(() => resolve()));
}

function killPids(pids: number[]): void {
  for (const pid of pids) {
    try {
      process.kill(pid, "SIGKILL");
    } catch {
      /* ignore */
    }
  }
}

test.describe("Studio-managed preview teardown", () => {
  test("full Quit waits for preview tree exit and frees the port", async () => {
    const { root, pidFile } = await writePreviewProject();
    const app: ElectronApplication = await launchStudioApp({
      e2eProject: null,
      mockProvider: true,
    });
    const page = await getMainWindow(app);
    await waitForStudioTestHooks(page);
    await openExistingProjectAt(page, root);
    const { port } = await startFixturePreview(page, root);
    const pids = await readFixturePids(pidFile);
    const electronPid = app.process()?.pid;
    expect(electronPid && electronPid > 1).toBeTruthy();
    expect(isPidAlive(pids.child)).toBe(true);

    try {
      await app.evaluate(async ({ app: electronApp }) => {
        electronApp.quit();
      });
      expect(await waitForPidExit(electronPid!, 10_000)).toBe(true);
      expect(isPidAlive(pids.child)).toBe(false);
      expect(isPidAlive(pids.server)).toBe(false);
      await bindPort(port);
    } finally {
      killPids([pids.child, pids.server, pids.npm, electronPid ?? 0]);
    }
  });

  test("switching projects stops the previous preview before the next root is active", async () => {
    const projectA = await writePreviewProject();
    const projectB = await fs.mkdtemp(path.join(os.tmpdir(), "bl-e2e-switch-b-"));
    const app: ElectronApplication = await launchStudioApp({
      e2eProject: null,
      mockProvider: true,
    });
    const page = await getMainWindow(app);
    await waitForStudioTestHooks(page);
    await openExistingProjectAt(page, projectA.root);
    const { port } = await startFixturePreview(page, projectA.root);
    const pids = await readFixturePids(projectA.pidFile);
    expect(isPidAlive(pids.child)).toBe(true);

    try {
      await openExistingProjectAt(page, projectB);
      expect(isPidAlive(pids.child)).toBe(false);
      expect(isPidAlive(pids.server)).toBe(false);
      await bindPort(port);
      const activePath = await page.evaluate(
        () => window.__studioTestHooks?.getReadinessState?.()?.projectPath ?? "",
      );
      expect(activePath).toBe(projectB);
    } finally {
      const electronPid = app.process()?.pid;
      try {
        await app.evaluate(async ({ app: electronApp }) => {
          electronApp.quit();
        });
      } catch {
        /* already exited */
      }
      if (electronPid) await waitForPidExit(electronPid, 10_000);
      killPids([pids.child, pids.server, pids.npm, electronPid ?? 0]);
    }
  });
});
