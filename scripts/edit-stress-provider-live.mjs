#!/usr/bin/env node
/**
 * Brownfield edit stress — live Gemini propose → apply → verify pipeline.
 *
 *   npm run edit:stress:provider:live
 *   npm run edit:stress:provider:live -- --prompt sudoku-hints
 *   npm run edit:stress:provider:live -- --text "add hints"
 *   npm run edit:stress:provider:live -- --project /path/to/project
 *
 * Requires GEMINI_API_KEY, GOOGLE_API_KEY, or BRYANTLABS_GEMINI_API_KEY.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import {
  runEditStressGeminiLiveCase,
  runEditStressGeminiLiveOnProject,
  runEditStressGeminiLiveSuite,
} from "../benchmarks/editStress/runEditStressGeminiLive.ts";
import { formatEditStressProviderReportMarkdown } from "../benchmarks/editStress/reporter.ts";
import { resolveGeminiModelForStress } from "../benchmarks/editStress/geminiApi.ts";

function parseArgs(argv) {
  const out = {
    json: false,
    prompt: "sudoku-hints",
    text: null,
    project: null,
    suite: false,
    skipVerify: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--json") out.json = true;
    else if (arg === "--suite") out.suite = true;
    else if (arg === "--skip-verify") out.skipVerify = true;
    else if (arg === "--prompt") out.prompt = argv[++i] ?? out.prompt;
    else if (arg === "--text") out.text = argv[++i] ?? null;
    else if (arg === "--project") out.project = argv[++i] ?? null;
  }
  return out;
}

async function main() {
  const args = parseArgs(process.argv);
  const model = resolveGeminiModelForStress();

  const result = args.suite
    ? await runEditStressGeminiLiveSuite({
        promptIds: [args.prompt],
        ...(args.skipVerify ? { skipVerify: true } : {}),
      })
    : await (async () => {
        const run = args.project
          ? await runEditStressGeminiLiveOnProject({
              projectPath: args.project,
              promptId: args.prompt,
              ...(args.text ? { promptText: args.text } : {}),
              ...(args.skipVerify ? { skipVerify: true } : {}),
            })
          : await runEditStressGeminiLiveCase({
              promptId: args.prompt,
              ...(args.text ? { promptText: args.text } : {}),
              ...(args.skipVerify ? { skipVerify: true } : {}),
            });
        const started = new Date();
        const finished = new Date();
        return {
          startedAt: started.toISOString(),
          finishedAt: finished.toISOString(),
          target: 1,
          passed: run.ok ? 1 : 0,
          total: 1,
          successRate: run.ok ? 1 : 0,
          targetMet: run.ok,
          providerPassed: run.providerOk ? 1 : 0,
          providerTargetMet: run.providerOk,
          runs: [run],
          geminiModel: model,
        };
      })();

  const outDir = join(process.cwd(), "benchmarks/results");
  await mkdir(outDir, { recursive: true });
  await writeFile(
    join(outDir, "edit-stress-provider-live-latest.json"),
    JSON.stringify(result, null, 2),
  );

  const md = [
    `# Brownfield edit stress report (live Gemini)`,
    ``,
    `- **Model:** ${model}`,
    ...(args.project ? [`- **Project:** ${args.project}`] : []),
    `- **Started:** ${result.startedAt}`,
    `- **Finished:** ${result.finishedAt}`,
    `- **Dry-run:** ${result.passed}/${result.total}`,
    `- **Provider pipeline:** ${result.providerPassed}/${result.total}`,
    `- **Target met:** ${result.providerTargetMet ? "yes" : "no"}`,
    ``,
    formatEditStressProviderReportMarkdown(result).split("\n").slice(2).join("\n"),
  ].join("\n");
  await writeFile(join(outDir, "edit-stress-provider-live-latest.md"), md);

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
