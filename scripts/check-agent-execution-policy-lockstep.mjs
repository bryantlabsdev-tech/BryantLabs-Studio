#!/usr/bin/env node
/**
 * Fail if src/core/agent/agentExecutionPolicy.ts and
 * electron/agentExecutionPolicy.cts diverge after import-path normalization.
 * Electron cannot import the renderer tree (rootDir is electron/).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(path.join(root, "src/core/agent/agentExecutionPolicy.ts"), "utf8");
const electron = fs.readFileSync(path.join(root, "electron/agentExecutionPolicy.cts"), "utf8");

function normalize(text, kind) {
  return text
    .replace(/\r\n/g, "\n")
    .replace(/from "\.\.\/git\/gitPushPolicy"/g, 'from "LOCKSTEP_GIT_PUSH"')
    .replace(/from "\.\/gitPushPolicy\.cjs"/g, 'from "LOCKSTEP_GIT_PUSH"')
    .replace(kind === "electron" ? "" : "", "");
}

const left = normalize(src, "src");
const right = normalize(electron, "electron");
if (left !== right) {
  console.error(
    "agent execution policy lockstep failed: src/core/agent/agentExecutionPolicy.ts and electron/agentExecutionPolicy.cts must match after import-path normalization.",
  );
  process.exit(1);
}
console.log("agent execution policy lockstep ok");
