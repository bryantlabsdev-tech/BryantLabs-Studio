#!/usr/bin/env node
/**
 * Brownfield edit stress harness — dry-run routing + planner validation.
 *
 *   npm run edit:stress
 *   npm run edit:stress -- --prompt sudoku-gameplay
 *   npm run edit:stress -- --json
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { runEditStressSuite } from "../benchmarks/editStress/runEditStressSuite.ts";
import { formatEditStressReportMarkdown } from "../benchmarks/editStress/reporter.ts";

function parseArgs(argv) {
  const out = { json: false, prompt: null };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") out.json = true;
    else if (arg === "--prompt") out.prompt = argv[++i] ?? null;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const promptIds = args.prompt ? [args.prompt] : undefined;
  const result = runEditStressSuite(promptIds);

  const outDir = join(process.cwd(), "benchmarks/results");
  await mkdir(outDir, { recursive: true });
  await writeFile(join(outDir, "edit-stress-latest.json"), JSON.stringify(result, null, 2));
  await writeFile(
    join(outDir, "edit-stress-latest.md"),
    formatEditStressReportMarkdown(result),
  );

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(formatEditStressReportMarkdown(result));
  }

  if (!result.targetMet) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
