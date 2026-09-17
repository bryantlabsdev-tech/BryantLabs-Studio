#!/usr/bin/env node
/**
 * Deterministic stress-fixture scaffolding (no network, no providers).
 *
 *   npm run greenfield:stress:scaffold -- --output /tmp/bryantlabs-stress-scaffold
 *   npm run greenfield:stress:scaffold -- --output /tmp/bryantlabs-stress-scaffold --overwrite
 *
 * Writes all 10 STRESS_PROMPTS projects plus scaffold-manifest.json.
 * Does not write into benchmarks/fixtures/stress/legacy or replay-frozen unless
 * --allow-corpus-output is passed (reserved for a future replacement command).
 */
import { writeDeterministicStressScaffolds } from "../benchmarks/stress/scaffold/write.ts";
import { ScaffoldOutputError } from "../benchmarks/stress/scaffold/outputGuard.ts";

function parseArgs(argv) {
  const out = {
    output: null,
    overwrite: false,
    allowCorpusOutput: false,
    operator: "unspecified",
    tool: "deterministic-scaffold",
    model: "none",
    json: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--output") out.output = argv[++i] ?? null;
    else if (arg === "--overwrite") out.overwrite = true;
    else if (arg === "--allow-corpus-output") out.allowCorpusOutput = true;
    else if (arg === "--operator") out.operator = argv[++i] ?? out.operator;
    else if (arg === "--tool") out.tool = argv[++i] ?? out.tool;
    else if (arg === "--model") out.model = argv[++i] ?? out.model;
    else if (arg === "--json") out.json = true;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const result = await writeDeterministicStressScaffolds({
    output: args.output,
    overwrite: args.overwrite,
    allowCorpusOutput: args.allowCorpusOutput,
    operator: args.operator,
    tool: args.tool,
    model: args.model,
  });
  if (args.json) {
    process.stdout.write(result.manifest);
    return;
  }
  console.log(`Wrote ${result.projects.length} stress scaffolds to ${result.outputRoot}`);
  console.log(`Manifest: ${result.manifestPath}`);
}

main().catch((err) => {
  const message = err instanceof ScaffoldOutputError ? err.message : String(err?.stack ?? err);
  console.error(message);
  process.exitCode = 1;
});
