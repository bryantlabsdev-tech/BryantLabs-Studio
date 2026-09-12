#!/usr/bin/env node
/**
 * Brownfield edit stress — full mock-provider propose → apply → verify pipeline.
 *
 *   npm run edit:stress:provider
 *   npm run edit:stress:provider:fast
 *   npm run edit:stress:provider -- --prompt sudoku-gameplay
 *   npm run edit:stress:provider -- --skip-verify
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  runEditStressProviderFastSuite,
  runEditStressProviderSuite,
} from "../benchmarks/editStress/runEditStressProvider.ts";
import { formatEditStressProviderReportMarkdown } from "../benchmarks/editStress/reporter.ts";

process.env.BRYANTLABS_MOCK_PROVIDER = "1";

function parseArgs(argv) {
  const out = { json: false, prompt: null, fast: false, skipVerify: false };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") out.json = true;
    else if (arg === "--fast") out.fast = true;
    else if (arg === "--skip-verify") out.skipVerify = true;
    else if (arg === "--prompt") out.prompt = argv[++i] ?? null;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const result = args.fast
    ? await runEditStressProviderFastSuite({
        ...(args.skipVerify ? { skipVerify: true } : {}),
      })
    : await runEditStressProviderSuite({
        ...(args.prompt ? { promptIds: [args.prompt] } : {}),
        ...(args.skipVerify ? { skipVerify: true } : {}),
      });

  const outDir = join(process.cwd(), "benchmarks/results");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "edit-stress-provider-latest.json"),
    JSON.stringify(result, null, 2),
  );
  const md = formatEditStressProviderReportMarkdown(result);
  await writeFile(join(outDir, "edit-stress-provider-latest.md"), md);

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(md);
  }

  if (!result.targetMet || !result.providerTargetMet) {
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
