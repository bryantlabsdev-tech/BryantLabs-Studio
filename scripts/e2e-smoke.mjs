#!/usr/bin/env node
/**
 * Platform smoke: full verify pipeline without launching Electron UI.
 * Suitable for CI when Playwright/Electron E2E is not configured.
 */
import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, "..");

function run(cmd) {
  execSync(cmd, { cwd: projectRoot, stdio: "inherit" });
}

run("npm run test:all");
run("npm run build");

const distMain = path.join(projectRoot, "dist-electron", "main.cjs");
const distPreload = path.join(projectRoot, "dist-electron", "preload.cjs");
const distIndex = path.join(projectRoot, "dist", "index.html");

for (const file of [distMain, distPreload, distIndex]) {
  if (!existsSync(file)) {
    console.error(`Missing build artifact: ${file}`);
    process.exit(1);
  }
}

console.log("Smoke test passed (build artifacts + unit/electron tests).");
