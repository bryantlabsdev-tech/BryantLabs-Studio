#!/usr/bin/env node
/**
 * Pre-build TypeScript gate:
 * 1. Run tsc and collect TS6133 diagnostics
 * 2. Auto-remove unused imports/locals/parameters
 * 3. Re-run until clean or no progress
 * 4. Fail the build if any TypeScript errors remain
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseTypeScriptDiagnostics } from "../src/core/greenfield/tscDiagnostics.ts";
import { applyUnusedCleanupToFile } from "../src/core/typescript/unusedCleanup.ts";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const checkOnly = process.argv.includes("--check-only");
const maxPasses = 12;

const projects = [
  { name: "renderer", config: "tsconfig.json" },
  { name: "electron", config: "electron/tsconfig.json" },
];

function runTsc(configPath) {
  const result = spawnSync(
    process.execPath,
    [
      path.join(root, "node_modules/typescript/lib/tsc.js"),
      "-p",
      configPath,
      "--noEmit",
      "--pretty",
      "false",
    ],
    { cwd: root, encoding: "utf8" },
  );
  const stdout = result.stdout ?? "";
  const stderr = result.stderr ?? "";
  const diagnostics = parseTypeScriptDiagnostics(stdout, stderr);
  return {
    exitCode: result.status ?? 1,
    stdout,
    stderr,
    diagnostics,
  };
}

function normalizePath(filePath) {
  const abs = path.isAbsolute(filePath)
    ? filePath
    : path.resolve(root, filePath);
  return abs.replace(/\\/g, "/");
}

function collectTs6133(diagnostics) {
  return diagnostics.filter(
    (d) => d.category === "error" && d.code === "TS6133",
  );
}

function applyFixes(ts6133) {
  const byFile = new Map();
  for (const diag of ts6133) {
    const abs = normalizePath(diag.file);
    const list = byFile.get(abs) ?? [];
    list.push({
      file: abs,
      line: diag.line,
      column: diag.column,
      message: diag.message,
    });
    byFile.set(abs, list);
  }

  let fixedCount = 0;
  for (const [absPath, fileDiags] of byFile) {
    if (!fs.existsSync(absPath)) continue;
    const original = fs.readFileSync(absPath, "utf8");
    const rel = path.relative(root, absPath).replace(/\\/g, "/");
    const repaired = applyUnusedCleanupToFile(original, fileDiags, rel);
    if (!repaired || repaired.content === original) continue;
    fs.writeFileSync(absPath, repaired.content, "utf8");
    fixedCount += repaired.fixes.length;
    console.log(`[ts6133] ${rel}: ${repaired.fixes.join(", ")}`);
  }
  return fixedCount;
}

function reportFailures(diagnostics) {
  const errors = diagnostics.filter((d) => d.category === "error");
  if (errors.length === 0) return;
  console.error("\nTypeScript errors remain after cleanup:\n");
  for (const d of errors.slice(0, 40)) {
    console.error(d.raw || `${d.file}(${d.line},${d.column}): ${d.code}: ${d.message}`);
  }
  if (errors.length > 40) {
    console.error(`... and ${errors.length - 40} more`);
  }
}

let lastTotal6133 = Number.POSITIVE_INFINITY;

for (let pass = 1; pass <= maxPasses; pass += 1) {
  let allDiagnostics = [];
  let hadErrors = false;

  for (const project of projects) {
    const { exitCode, diagnostics } = runTsc(project.config);
    allDiagnostics = allDiagnostics.concat(
      diagnostics.map((d) => ({ ...d, project: project.name })),
    );
    if (exitCode !== 0) hadErrors = true;
  }

  const ts6133 = collectTs6133(allDiagnostics);
  const otherErrors = allDiagnostics.filter(
    (d) => d.category === "error" && d.code !== "TS6133",
  );

  if (!hadErrors) {
    console.log("TypeScript check passed.");
    process.exit(0);
  }

  if (otherErrors.length > 0 && ts6133.length === 0) {
    reportFailures(otherErrors);
    process.exit(1);
  }

  if (checkOnly) {
    reportFailures(allDiagnostics.filter((d) => d.category === "error"));
    process.exit(1);
  }

  if (ts6133.length === 0) {
    reportFailures(otherErrors);
    process.exit(1);
  }

  if (ts6133.length >= lastTotal6133) {
    console.error(
      `[ts6133] Cleanup stalled with ${ts6133.length} unused declaration(s) remaining.`,
    );
    reportFailures(allDiagnostics.filter((d) => d.category === "error"));
    process.exit(1);
  }

  lastTotal6133 = ts6133.length;
  const fixed = applyFixes(ts6133);
  if (fixed === 0) {
    console.error("[ts6133] No automatic fixes applied.");
    reportFailures(allDiagnostics.filter((d) => d.category === "error"));
    process.exit(1);
  }
  console.log(`[ts6133] Pass ${pass}: applied ${fixed} fix(es).`);
}

console.error(`[ts6133] Exceeded ${maxPasses} cleanup passes.`);
process.exit(1);
