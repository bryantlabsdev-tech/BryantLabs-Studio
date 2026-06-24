#!/usr/bin/env node
/**
 * Run compiled electron main-process tests from dist-electron/.
 * Requires `npm run build:electron` first.
 */
import { execSync } from "node:child_process";
import { readdirSync, statSync } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(root, "..");
const distElectron = path.join(projectRoot, "dist-electron");

function collectTestFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const abs = path.join(dir, entry);
    const stat = statSync(abs);
    if (stat.isDirectory()) {
      out.push(...collectTestFiles(abs));
      continue;
    }
    if (entry.endsWith(".test.cjs")) {
      out.push(abs);
    }
  }
  return out;
}

execSync("npm run build:electron", {
  cwd: projectRoot,
  stdio: "inherit",
});

const tests = collectTestFiles(distElectron);
if (tests.length === 0) {
  console.error("No electron tests found under dist-electron/");
  process.exit(1);
}

execSync(`node --test ${tests.map((t) => JSON.stringify(t)).join(" ")}`, {
  cwd: projectRoot,
  stdio: "inherit",
});
