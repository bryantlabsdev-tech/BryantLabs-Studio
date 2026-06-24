#!/usr/bin/env node
/**
 * Greenfield stress-test harness — 10 hard SaaS prompts (+ fast 5-prompt mode).
 *
 * Dry run (default, CI-safe — manifest/routing only):
 *   npm run greenfield:stress
 *
 * Live generation (requires Gemini key in provider-settings.json):
 *   npm run greenfield:stress:live
 *
 * Fast live validation (5 curated prompts, target 4/5):
 *   npm run greenfield:stress:live:5
 *   npm run greenfield:stress:live -- --limit 5
 *   npm run greenfield:stress:live -- --fast
 *
 * Replay (frozen corpus only — does not read live output):
 *   npm run greenfield:stress:replay
 *
 * Lock live failures into frozen replay corpus:
 *   npm run greenfield:stress:lock-replay
 *   npm run greenfield:stress -- --prompt fleetops-pro
 *
 * Options:
 *   --live              Run live generation + verify + deterministic repair
 *   --fast              Run curated 5-prompt fast suite
 *   --limit <n>         Run first N prompts (--limit 5 uses fast curated set)
 *   --prompt <id>       Run one prompt (repeatable)
 *   --output <dir>      Live output root (default ~/Desktop/studiotest/stress/live)
 *   --json              Print JSON only
 */
import { homedir } from "node:os";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { runStressSuite } from "../benchmarks/stress/runStressSuite.ts";
import { formatStressReportMarkdown } from "../benchmarks/stress/reporter.ts";
import { writeStressArtifacts, readPreviousStressResult } from "../benchmarks/stress/history.ts";
import { resolveStressPromptSelection } from "../benchmarks/stress/promptSelection.ts";
import {
  replayRepairsOnFailedProjects,
  REPLAY_FROZEN_PROJECT_IDS,
} from "../benchmarks/stress/repairReplay.ts";
import { defaultLiveStressRoot } from "../benchmarks/stress/stressPaths.ts";
import { normalizeProviderSettings } from "../src/core/providers/orchestration.ts";
import * as gemini from "../dist-electron/providers/gemini.cjs";

function parseArgs(argv) {
  const out = {
    live: false,
    json: false,
    fast: false,
    limit: null,
    prompt: null,
    output: defaultLiveStressRoot(),
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--live") out.live = true;
    else if (arg === "--json") out.json = true;
    else if (arg === "--fast") out.fast = true;
    else if (arg === "--prompt") out.prompt = argv[++i] ?? null;
    else if (arg === "--limit") {
      const raw = argv[++i];
      out.limit = raw != null ? Number.parseInt(raw, 10) : null;
    } else if (arg === "--output") out.output = argv[++i] ?? out.output;
  }
  return out;
}

const settingsPath = join(
  homedir(),
  "Library/Application Support/bryantlabs-studio/provider-settings.json",
);

async function loadSettings() {
  const text = await readFile(settingsPath, "utf8");
  const parsed = JSON.parse(text);
  const geminiApiKey =
    typeof parsed.geminiApiKey === "string" ? parsed.geminiApiKey : "";
  let geminiModel =
    typeof parsed.geminiModel === "string"
      ? parsed.geminiModel
      : "gemini-2.5-pro";
  if (geminiModel === "gemini-2.0-flash") geminiModel = "gemini-2.5-pro";
  const raw = {
    provider: "gemini",
    geminiModel,
    geminiApiKey,
    ollamaModel: parsed.ollamaModel ?? "llama3.2",
    ollamaBaseUrl: parsed.ollamaBaseUrl ?? "http://127.0.0.1:11434",
    anthropicApiKey: parsed.anthropicApiKey ?? "",
    anthropicModel: parsed.anthropicModel ?? "claude-sonnet-4-6",
    groqApiKey: parsed.groqApiKey ?? "",
    groqModel: parsed.groqModel ?? "llama-3.3-70b-versatile",
    openrouterApiKey: parsed.openrouterApiKey ?? "",
    openrouterModel: parsed.openrouterModel ?? "anthropic/claude-sonnet-4",
  };
  const settings = normalizeProviderSettings({
    provider: "gemini",
    geminiModel,
    hasGeminiKey: Boolean(geminiApiKey.trim()),
    hasAnthropicKey: Boolean(raw.anthropicApiKey.trim()),
    hasGroqKey: Boolean(raw.groqApiKey.trim()),
    hasOpenRouterKey: Boolean(raw.openrouterApiKey.trim()),
    ollamaModel: raw.ollamaModel,
    ollamaBaseUrl: raw.ollamaBaseUrl,
    anthropicModel: raw.anthropicModel,
    groqModel: raw.groqModel,
    openrouterModel: raw.openrouterModel,
  });
  return { raw, settings };
}

function phaseMaxOutputTokens(model) {
  return /2\.5-pro|thinking/i.test(model ?? "") ? 16384 : 8192;
}

async function main() {
  const args = parseArgs(process.argv);
  const mode = args.live || process.env.BRYANTLABS_STRESS_LIVE === "1" ? "live" : "dry-run";
  const useFast =
    args.fast ||
    args.limit === 5 ||
    process.env.BRYANTLABS_STRESS_FAST === "1";

  let selection;
  try {
    selection = resolveStressPromptSelection({
      promptId: args.prompt,
      limit: args.limit,
      fast: useFast,
    });
  } catch (err) {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }

  let provider = "gemini";
  let model = "gemini-2.5-pro";
  let host = undefined;

  if (mode === "live") {
    let loaded;
    try {
      loaded = await loadSettings();
    } catch {
      console.error(`Could not read provider settings at ${settingsPath}`);
      process.exit(1);
    }
    if (!loaded.raw.geminiApiKey.trim()) {
      console.error("Gemini API key required for live stress run.");
      process.exit(1);
    }
    provider = loaded.settings.provider;
    model = loaded.raw.geminiModel;
    const maxTokens = phaseMaxOutputTokens(loaded.raw.geminiModel);
    host = {
      settings: loaded.settings,
      api: {
        greenfieldGenerateRaw: async (_provider, prompt) => {
          const res = await gemini.generate(loaded.raw, prompt, maxTokens, {
            timeoutMs: 180_000,
            operation: "greenfield",
          });
          return {
            ok: res.ok,
            provider: res.provider,
            model: res.model,
            rawText: res.text,
            text: res.text,
            latencyMs: res.latencyMs,
            ...(res.error ? { error: res.error } : {}),
          };
        },
      },
    };
  }

  let result = await runStressSuite({
    mode,
    outputRoot: args.output,
    provider,
    model,
    promptIds: selection.prompts.map((p) => p.id),
    suiteId: selection.suiteId,
    host,
  });

  result = { ...result, liveOutputRoot: args.output };

  if (mode === "live") {
    const frozenReplay = await replayRepairsOnFailedProjects({
      projectIds: REPLAY_FROZEN_PROJECT_IDS,
    });
    result = {
      ...result,
      frozenReplay: {
        corpusRoot: frozenReplay.corpusRoot,
        typecheckPassCount: frozenReplay.typecheckPassCount,
        buildPassCount: frozenReplay.buildPassCount,
        passTarget: frozenReplay.passTarget,
        targetMet: frozenReplay.targetMet,
        projects: frozenReplay.results.map((r) => ({
          id: r.id,
          typecheckOk: r.typecheckOk,
          buildOk: r.buildOk,
          deterministicPasses: r.deterministicPasses,
          repairAttempts: r.repairAttempts,
        })),
      },
    };
  }

  const previous = await readPreviousStressResult();
  const markdown = formatStressReportMarkdown(result, previous);
  const { jsonPath, markdownPath } = await writeStressArtifacts(result, markdown, {
    suiteId: selection.suiteId,
  });

  if (args.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log(markdown);
    console.log("");
    console.log(`JSON: ${jsonPath}`);
    console.log(`Markdown: ${markdownPath}`);
  }

  const targetRate = result.suiteTarget?.successRateTarget ?? 0.8;
  const passTarget = result.suiteTarget?.passTarget ?? Math.ceil(result.runs.length * targetRate);
  const passCount = result.runs.filter((r) => r.finalStatus === "success").length;
  const pass = passCount >= passTarget;
  if (!pass) {
    console.error(
      `\nStress suite score ${passCount}/${result.runs.length} below target ${passTarget}/${result.runs.length}.`,
    );
  }
  process.exit(pass ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
