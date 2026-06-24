/**
 * FleetOps A22 greenfield E2E — validates manifest page extraction and optionally
 * runs live multi-phase generation into ~/Desktop/studiotest/A22.
 *
 * Dry run (default):
 *   node --experimental-strip-types --import ./scripts/test-alias-hook.mjs ./scripts/greenfield-fleetops-a22.mjs
 *
 * Live (requires Gemini key in provider-settings.json):
 *   BRYANTLABS_A22_LIVE=1 node --experimental-strip-types --import ./scripts/test-alias-hook.mjs ./scripts/greenfield-fleetops-a22.mjs
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { classifyGreenfieldGenerationRoute } from "../src/core/greenfield/greenfieldRouter.ts";
import { planManifestFromPrompt } from "../src/core/greenfield/manifestPlanner.ts";
import { runMultiPhaseGreenfieldGenerate } from "../src/core/greenfield/multiPhasePipeline.ts";
import { normalizeProviderSettings } from "../src/core/providers/orchestration.ts";
import * as gemini from "../dist-electron/providers/gemini.cjs";

const FLEETOPS_PROMPT = `
Build FleetOps — fleet management SaaS with React Router and Tailwind.

Pages:
* Dashboard
* Vehicles
* Drivers
* Dispatch
* Maintenance
* Fuel Logs
* Inspections
* Reports
* Settings
`.trim();

const FORBIDDEN_PAGES = ["Leads", "Jobs", "Estimates", "Invoices", "Customers"];
const EXPECTED_PAGES = [
  "Dashboard",
  "Vehicles",
  "Drivers",
  "Dispatch",
  "Maintenance",
  "Fuel Logs",
  "Inspections",
  "Reports",
  "Settings",
];

const OUTPUT_ROOT = join(homedir(), "Desktop/studiotest/A22");

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
  const route = classifyGreenfieldGenerationRoute(FLEETOPS_PROMPT);
  const manifest = planManifestFromPrompt(FLEETOPS_PROMPT);
  const titles = manifest.pages.map((p) => p.title);
  const paths = manifest.pagePaths.map((p) => p.split("/").pop());
  const noFieldFlow = FORBIDDEN_PAGES.every((t) => !titles.includes(t));
  const hasFleetPages = ["Vehicles", "Fuel Logs", "Drivers"].every((t) =>
    titles.includes(t),
  );
  return {
    route,
    manifest,
    ok:
      route.mode === "multi-phase" &&
      manifest.appName === "FleetOps" &&
      manifest.pages.length === 9 &&
      manifest.useRouter &&
      noFieldFlow &&
      hasFleetPages &&
      paths.includes("FuelLogs.tsx") &&
      paths.includes("Vehicles.tsx"),
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

function assertLiveOutput(result) {
  const pageFiles = (result.projectFiles ?? []).filter(
    (f) => f.path.startsWith("src/pages/") && f.path.endsWith(".tsx"),
  );
  const names = pageFiles.map((f) => f.path.replace("src/pages/", "").replace(".tsx", ""));
  const forbidden = FORBIDDEN_PAGES.filter((p) =>
    names.some((n) => n.toLowerCase() === p.toLowerCase().replace(/\s+/g, "")),
  );
  const missing = EXPECTED_PAGES.filter((p) => {
    const file = p.replace(/\s+/g, "");
    return !names.includes(file);
  });
  return {
    pageFileNames: names,
    forbidden,
    missing,
    ok: result.ok && forbidden.length === 0 && missing.length === 0,
  };
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

  const result = await runMultiPhaseGreenfieldGenerate(host, FLEETOPS_PROMPT);
  const toWrite = result.projectFiles ?? result.files ?? [];
  const acceptance = assertLiveOutput({ ...result, projectFiles: toWrite });
  if (result.ok && acceptance.ok && toWrite.length) {
    await writeProjectFiles(toWrite);
  }
  return { ...result, writtenFileCount: toWrite.length, acceptance };
}

async function main() {
  const dry = dryRunChecks();
  console.log(
    JSON.stringify(
      {
        phase: "dry-run",
        routeMode: dry.route.mode,
        appName: dry.manifest.appName,
        pageCount: dry.manifest.pages.length,
        pages: dry.manifest.pages.map((p) => p.title),
        pagePaths: dry.manifest.pagePaths,
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

  if (process.env.BRYANTLABS_A22_LIVE !== "1") {
    console.log("Dry run passed. Set BRYANTLABS_A22_LIVE=1 for live multi-phase generation.");
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
    console.error("Gemini API key required for live A22 run.");
    process.exit(1);
  }

  console.log("Starting live FleetOps multi-phase generation…");
  const live = await runLive(loaded);
  console.log(
    JSON.stringify(
      {
        phase: "live",
        ok: live.ok && live.acceptance?.ok,
        projectFileCount: live.projectFiles?.length ?? 0,
        writtenFileCount: live.writtenFileCount ?? 0,
        acceptance: live.acceptance,
        stubbedPagePaths: live.stubbedPagePaths ?? [],
        warnings: live.warnings ?? [],
        error: live.error ?? null,
      },
      null,
      2,
    ),
  );
  process.exit(live.ok && live.acceptance?.ok ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
