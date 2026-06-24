#!/usr/bin/env node
/**
 * BryantLabs Studio benchmark runner.
 *
 * Usage:
 *   node --experimental-strip-types --import ./scripts/test-alias-hook.mjs scripts/run-benchmarks.mjs
 *   node --experimental-strip-types --import ./scripts/test-alias-hook.mjs scripts/run-benchmarks.mjs --suite app_creation
 *   node --experimental-strip-types --import ./scripts/test-alias-hook.mjs scripts/run-benchmarks.mjs --json
 */
import { runBenchmarkSuite } from "../benchmarks/runSuite.ts";

const args = process.argv.slice(2);
const suiteArgIdx = args.indexOf("--suite");
const suite = suiteArgIdx >= 0 ? args[suiteArgIdx + 1] : "all";
const jsonOnly = args.includes("--json");
const validSuites = new Set([
  "all",
  "app_creation",
  "feature_addition",
  "bug_fixing",
  "refactoring",
  "requirement_satisfaction",
]);

if (!suite || !validSuites.has(suite)) {
  console.error(
    `Invalid --suite. Expected one of: ${[...validSuites].join(", ")}`,
  );
  process.exit(1);
}

const { scorecard, markdown, jsonPath, markdownPath } = await runBenchmarkSuite(suite);

if (jsonOnly) {
  console.log(JSON.stringify(scorecard, null, 2));
} else {
  console.log(markdown);
  console.log("");
  console.log(`Scorecard JSON: ${jsonPath}`);
  console.log(`Latest markdown: ${markdownPath}`);
  console.log(`Overall: ${scorecard.overallScore}/100 ${scorecard.overallPass ? "PASS" : "FAIL"}`);
}

process.exit(scorecard.overallPass ? 0 : 1);
