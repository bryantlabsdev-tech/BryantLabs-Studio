#!/usr/bin/env node
/**
 * Launch the Electron app with ELECTRON_RUN_AS_NODE cleared.
 * Cursor/IDE shells often set ELECTRON_RUN_AS_NODE=1, which makes
 * require('electron') return the binary path instead of the API.
 */
import { spawn } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const electronBin = path.join(projectRoot, "node_modules", ".bin", "electron");

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const args = process.argv.slice(2);
if (args.length === 0) args.push(".");

const child = spawn(electronBin, args, {
  cwd: projectRoot,
  stdio: "inherit",
  env,
});

child.on("exit", (code, signal) => {
  if (signal) process.exit(1);
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  console.error("[run-electron-app] Failed to start Electron:", err.message);
  process.exit(1);
});
