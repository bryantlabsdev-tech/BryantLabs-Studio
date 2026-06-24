/**
 * FieldFlow A19 greenfield E2E — validates routing/manifest and optionally
 * runs live multi-phase generation into ~/Desktop/studiotest/A19.
 *
 * Dry run (default):
 *   node --experimental-strip-types --import ./scripts/test-alias-hook.mjs ./scripts/greenfield-fieldflow-a19.mjs
 *
 * Live (requires Gemini key in provider-settings.json):
 *   BRYANTLABS_A19_LIVE=1 node --experimental-strip-types --import ./scripts/test-alias-hook.mjs ./scripts/greenfield-fieldflow-a19.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { classifyGreenfieldGenerationRoute } from "../src/core/greenfield/greenfieldRouter.ts";
import { planManifestFromPrompt } from "../src/core/greenfield/manifestPlanner.ts";
import { runMultiPhaseGreenfieldGenerate } from "../src/core/greenfield/multiPhasePipeline.ts";
import { normalizeProviderSettings } from "../src/core/providers/orchestration.ts";
import * as gemini from "../dist-electron/providers/gemini.cjs";

const FIELD_FLOW_PROMPT =
  "Build FieldFlow — a multi-page SaaS dashboard with leads, jobs, estimates, invoices, customers, and settings pages using React Router.";

const OUTPUT_ROOT = join(homedir(), "Desktop/studiotest/A19");

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

function dryRunChecks() {
  const route = classifyGreenfieldGenerationRoute(FIELD_FLOW_PROMPT);
  const manifest = planManifestFromPrompt(FIELD_FLOW_PROMPT);
  return {
    route,
    manifest,
    ok:
      route.mode === "multi-phase" &&
      manifest.pages.length >= 6 &&
      manifest.useRouter,
  };
}

async function writeProjectFiles(files) {
  await mkdir(OUTPUT_ROOT, { recursive: true });
  for (const file of files) {
    const abs = join(OUTPUT_ROOT, file.path);
    await mkdir(join(abs, ".."), { recursive: true });
    await writeFile(abs, file.content, "utf8");
  }
}

function phaseMaxOutputTokens(model) {
  return /2\.5-pro|thinking/i.test(model ?? "") ? 16384 : 8192;
}

async function runLive({ raw, settings }) {
  const maxTokens = phaseMaxOutputTokens(raw.geminiModel);
  const host = {
    settings,
    api: {
      greenfieldGenerateRaw: async (_provider, prompt) => {
        const res = await gemini.generate(raw, prompt, maxTokens, {
          timeoutMs: 180_000,
          operation: "greenfield",
        });
        return {
          ok: res.ok,
          provider: res.provider,
          model: res.model,
          rawText: res.text,
          text: res.text,
          raw: res.raw,
          latencyMs: res.latencyMs,
          ...(res.error ? { error: res.error } : {}),
        };
      },
    },
    providerStopReasonRef: { current: null },
    prepareGreenfieldBudget: () => {},
    prepareMultiPhaseGreenfieldBudget: () => {},
    resetAiCallBudget: () => {},
    invokeGreenfieldRawCall: async (_settings, _tokens, call) => call(settings.provider),
  };

  const result = await runMultiPhaseGreenfieldGenerate(host, FIELD_FLOW_PROMPT);
  const toWrite = result.projectFiles ?? result.files ?? [];
  if (result.ok && toWrite.length) {
    await writeProjectFiles(toWrite);
  }
  return { ...result, writtenFileCount: toWrite.length };
}

async function main() {
  const dry = dryRunChecks();
  console.log(
    JSON.stringify(
      {
        phase: "dry-run",
        routeMode: dry.route.mode,
        pageCount: dry.manifest.pages.length,
        useRouter: dry.manifest.useRouter,
        outputRoot: OUTPUT_ROOT,
        ok: dry.ok,
      },
      null,
      2,
    ),
  );

  if (!dry.ok) {
    process.exit(1);
  }

  if (process.env.BRYANTLABS_A19_LIVE !== "1") {
    console.log("Dry run passed. Set BRYANTLABS_A19_LIVE=1 for live multi-phase generation.");
    return;
  }

  let loaded;
  try {
    loaded = await loadSettings();
  } catch {
    console.error(`Could not read provider settings at ${settingsPath}`);
    process.exit(1);
  }

  if (!loaded.raw.geminiApiKey.trim()) {
    console.error("Gemini API key required for live A19 run.");
    process.exit(1);
  }

  console.log("Starting live FieldFlow multi-phase generation…");
  const live = await runLive(loaded);
  console.log(
    JSON.stringify(
      {
        phase: "live",
        ok: live.ok,
        projectFileCount: live.projectFiles?.length ?? 0,
        coreFileCount: live.files?.length ?? 0,
        writtenFileCount: live.writtenFileCount ?? 0,
        stubbedPagePaths: live.stubbedPagePaths ?? [],
        warnings: live.warnings ?? [],
        error: live.error ?? null,
      },
      null,
      2,
    ),
  );
  process.exit(live.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
