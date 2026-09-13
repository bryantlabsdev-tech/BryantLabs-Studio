#!/usr/bin/env node
/**
 * Brownfield edit stress — dry-run routing + mock patch validation.
 *
 *   npm run edit:stress:live
 *   npm run edit:stress:live -- --prompt sudoku-gameplay
 *   npm run edit:stress:live -- --json
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { runEditStressLiveSuite } from "../benchmarks/editStress/runEditStressLive.ts";
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
  const result = await runEditStressLiveSuite(promptIds);

  const outDir = join(process.cwd(), "benchmarks/results");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "edit-stress-live-latest.json"),
    JSON.stringify(result, null, 2),
  );

  const md = [
    formatEditStressReportMarkdown(result),
    "",
    `## Live mock patch validation`,
    `- Live passed: **${result.livePassed}/${result.total}**`,
    `- Live target met: **${result.liveTargetMet ? "yes" : "no"}**`,
    "",
    ...result.runs
      .filter((r) => !r.liveOk)
      .map((r) => `- ${r.id}: ${r.liveReason ?? "failed"}`),
  ].join("\n");
  await writeFile(join(outDir, "edit-stress-live-latest.md"), md);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(md);
  }

  if (!result.targetMet || !result.liveTargetMet) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
