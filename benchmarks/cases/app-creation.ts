import { validateGreenfieldProject } from "@/core/greenfield/fileValidation";
import { parseGreenfieldFileMarkers } from "@/core/greenfield/parseResponse";
import { runGreenfieldGenerateWithReliability } from "@/core/greenfield/generatePipeline";
import { normalizeProviderSettings } from "@/core/providers/orchestration";
import { classifyGreenfieldGenerationRoute } from "@/core/greenfield/greenfieldRouter";
import { planManifestFromPrompt } from "@/core/greenfield/manifestPlanner";
import { GREENFIELD_FILE_PATHS } from "@/core/greenfield/types";
import { allSevenFiles, rawFromFiles } from "../fixtures/greenfield";
import { allPassed, check, timed } from "../harness/evaluators";
import type { BenchmarkCaseDefinition, BenchmarkCaseResult } from "../types";

const SETTINGS = normalizeProviderSettings({
  provider: "gemini",
  geminiModel: "gemini-2.5-flash",
  hasGeminiKey: true,
  hasAnthropicKey: true,
  hasGroqKey: false,
  hasOpenRouterKey: false,
  ollamaModel: "qwen2.5-coder:7b",
  ollamaBaseUrl: "http://localhost:11434",
  anthropicModel: "claude-sonnet-4-6",
  groqModel: "llama-3.3-70b-versatile",
  openrouterModel: "anthropic/claude-sonnet-4",
} as import("@/core/providers/types").ProviderSettings);

export const APP_CREATION_CASES: readonly BenchmarkCaseDefinition[] = [
  {
    id: "create.parse_complete",
    category: "app_creation",
    name: "Parse complete greenfield output",
    description: "All seven scaffold files parse and validate.",
    weight: 1,
  },
  {
    id: "create.reliability_success",
    category: "app_creation",
    name: "Reliability pipeline accepts complete generation",
    description: "runGreenfieldGenerateWithReliability returns ok for a full provider response.",
    weight: 1,
  },
  {
    id: "create.partial_with_app",
    category: "app_creation",
    name: "Partial parse with real App.tsx",
    description: "Missing non-critical files may skeleton-fill while App.tsx stays provider-generated.",
    weight: 1,
  },
  {
    id: "create.block_skeleton_app",
    category: "app_creation",
    name: "Block skeleton App.tsx fill",
    description: "Generation fails when App.tsx would be skeleton-filled.",
    weight: 1,
  },
  {
    id: "create.block_zero_files",
    category: "app_creation",
    name: "Block zero-file skeleton fallback",
    description: "Empty provider output must not silently succeed with placeholder app.",
    weight: 1,
  },
  {
    id: "create.fieldflow_multiphase_route",
    category: "app_creation",
    name: "FieldFlow routes to multi-phase greenfield",
    description: "Complex FieldFlow prompts select multi-phase generation mode.",
    weight: 1,
  },
  {
    id: "create.fieldflow_a19_manifest",
    category: "app_creation",
    name: "FieldFlow A19 manifest pages",
    description: "FieldFlow prompt plans dashboard + CRM pages for A19 E2E.",
    weight: 1,
  },
  {
    id: "create.fleetops_manifest",
    category: "app_creation",
    name: "FleetOps manifest from bullet Pages",
    description: "FleetOps prompt must not fall back to FieldFlow CRM pages.",
    weight: 1,
  },
];

async function runCase(
  def: BenchmarkCaseDefinition,
  run: () => Promise<BenchmarkCaseResult["checks"]>,
): Promise<BenchmarkCaseResult> {
  const started = performance.now();
  try {
    const checks = await run();
    return {
      ...def,
      passed: allPassed(checks),
      durationMs: Math.round(performance.now() - started),
      checks,
    };
  } catch (err) {
    return {
      ...def,
      passed: false,
      durationMs: Math.round(performance.now() - started),
      checks: [],
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

export async function runAppCreationCase(
  def: BenchmarkCaseDefinition,
): Promise<BenchmarkCaseResult> {
  switch (def.id) {
    case "create.parse_complete":
      return runCase(def, async () => {
        const files = allSevenFiles();
        const raw = rawFromFiles(files);
        const parsed = parseGreenfieldFileMarkers(raw);
        const validation = validateGreenfieldProject(parsed);
        return [
          check("parsed_count", "Parsed file count is 7", parsed?.length === 7, "7", String(parsed?.length ?? 0)),
          check("validation_ok", "Project validation passes", validation.ok, "true", String(validation.ok)),
          check(
            "missing_files",
            "No missing greenfield paths",
            validation.missingFiles.length === 0,
            "0",
            String(validation.missingFiles.length),
          ),
        ];
      });

    case "create.reliability_success":
      return runCase(def, async () => {
        const files = allSevenFiles();
        const raw = rawFromFiles(files);
        const { result, durationMs } = await timed(() =>
          runGreenfieldGenerateWithReliability(
            {
              api: {
                greenfieldGenerate: async () => ({
                  ok: true,
                  provider: "gemini",
                  model: "gemini-2.5-flash",
                  rawText: raw,
                  latencyMs: 10,
                }),
              } as never,
              settings: SETTINGS,
              invokeGreenfieldCall: async (_s, _t, call) => call("gemini") as never,
            },
            "Build a todo app",
          ),
        );
        return [
          check("ok", "Generation succeeded", result.ok, "true", String(result.ok)),
          check("file_count", "Seven files returned", result.files?.length === 7, "7", String(result.files?.length ?? 0)),
          check("no_skeleton", "No skeleton fallback used", !result.fallbackSkeletonUsed, "false", String(result.fallbackSkeletonUsed)),
          check("latency", "Completed under 5s (mock)", durationMs < 5000, "<5000ms", `${durationMs}ms`),
        ];
      });

    case "create.partial_with_app":
      return runCase(def, async () => {
        const partial = allSevenFiles().filter(
          (f) => f.path !== "vite.config.ts" && f.path !== "src/index.css",
        );
        const raw = rawFromFiles(partial);
        const result = await runGreenfieldGenerateWithReliability(
          {
            api: {
              greenfieldGenerate: async () => ({
                ok: false,
                provider: "gemini",
                model: "gemini-2.5-flash",
                rawText: raw,
                latencyMs: 10,
                error: "Greenfield parse incomplete: parsed 5/7 expected files.",
              }),
            } as never,
            settings: SETTINGS,
            invokeGreenfieldCall: async (_s, _t, call) => call("gemini") as never,
          },
          "Build FieldFlow",
        );
        return [
          check("ok", "Partial generation succeeds", result.ok, "true", String(result.ok)),
          check("partial", "Marked partial success", Boolean(result.partialSuccess), "true", String(result.partialSuccess)),
          check("file_count", "All seven files present after fill", result.files?.length === 7, "7", String(result.files?.length ?? 0)),
        ];
      });

    case "create.block_skeleton_app":
      return runCase(def, async () => {
        const partial = allSevenFiles().slice(0, 4);
        const raw = rawFromFiles(partial);
        const result = await runGreenfieldGenerateWithReliability(
          {
            api: {
              greenfieldGenerate: async () => ({
                ok: false,
                provider: "gemini",
                model: "gemini-2.5-flash",
                rawText: raw,
                latencyMs: 10,
                error: "Greenfield parse incomplete: parsed 4/7 expected files.",
              }),
            } as never,
            settings: SETTINGS,
            invokeGreenfieldCall: async (_s, _t, call) => call("gemini") as never,
          },
          "Build FieldFlow",
        );
        return [
          check("blocked", "Generation blocked when App would be skeleton", !result.ok, "false", String(result.ok)),
          check("error", "Error mentions skeleton block", /skeleton|blocked/i.test(result.error ?? ""), "blocked message", result.error ?? ""),
          check("fallback_flag", "Skeleton fallback attempted", Boolean(result.fallbackSkeletonUsed), "true", String(result.fallbackSkeletonUsed)),
        ];
      });

    case "create.block_zero_files":
      return runCase(def, async () => {
        const result = await runGreenfieldGenerateWithReliability(
          {
            api: {
              greenfieldGenerate: async () => ({
                ok: false,
                provider: "anthropic",
                model: "claude-haiku",
                rawText: "Prose only — no file markers.",
                latencyMs: 5,
                error: "Greenfield parse incomplete: parsed 0/7 expected files.",
              }),
            } as never,
            settings: SETTINGS,
            invokeGreenfieldCall: async (_s, _t, call) => call("anthropic") as never,
          },
          "Build calculator",
        );
        return [
          check("blocked", "Zero-file generation fails", !result.ok, "false", String(result.ok)),
          check("paths", "Expected file count constant", GREENFIELD_FILE_PATHS.length === 7, "7", String(GREENFIELD_FILE_PATHS.length)),
          check("error", "Error mentions skeleton block", /skeleton|blocked/i.test(result.error ?? ""), "blocked message", result.error ?? ""),
        ];
      });

    case "create.fieldflow_multiphase_route":
      return runCase(def, async () => {
        const prompt =
          "Build FieldFlow — a multi-page SaaS dashboard with leads, jobs, estimates, invoices, customers, and settings pages using React Router.";
        const route = classifyGreenfieldGenerationRoute(prompt);
        return [
          check("mode", "Routes to multi-phase", route.mode === "multi-phase", "multi-phase", route.mode),
          check("score", "Complexity score high enough", route.score >= 4, ">=4", String(route.score)),
          check("reasons", "Records routing reasons", route.reasons.length > 0, ">0", String(route.reasons.length)),
        ];
      });

    case "create.fieldflow_a19_manifest":
      return runCase(def, async () => {
        const prompt =
          "Build FieldFlow — a multi-page SaaS dashboard with leads, jobs, estimates, invoices, customers, and settings pages using React Router.";
        const manifest = planManifestFromPrompt(prompt);
        const titles = manifest.pages.map((p) => p.title);
        return [
          check("pages", "Plans six+ pages", manifest.pages.length >= 6, ">=6", String(manifest.pages.length)),
          check("router", "Enables React Router", manifest.useRouter, "true", String(manifest.useRouter)),
          check("dashboard", "Includes Dashboard", titles.includes("Dashboard"), "Dashboard", titles.join(", ")),
          check("settings", "Includes Settings", titles.includes("Settings"), "Settings", titles.join(", ")),
        ];
      });

    case "create.fleetops_manifest":
      return runCase(def, async () => {
        const prompt = `
Build FleetOps — fleet management SaaS with React Router.

Pages:
* Dashboard
* Vehicles
* Drivers
* Dispatch
* Maintenance
* Fuel Logs
* Inspections
* Reports
* Settings`;
        const manifest = planManifestFromPrompt(prompt);
        const titles = manifest.pages.map((p) => p.title);
        const paths = manifest.pagePaths.join(",");
        return [
          check("app", "FleetOps app name", manifest.appName === "FleetOps", "FleetOps", manifest.appName),
          check("count", "Nine pages", manifest.pages.length === 9, "9", String(manifest.pages.length)),
          check("vehicles", "Includes Vehicles", titles.includes("Vehicles"), "Vehicles", titles.join(", ")),
          check("fuel", "Fuel Logs path", paths.includes("FuelLogs.tsx"), "FuelLogs.tsx", paths),
          check("no_leads", "No FieldFlow Leads page", !titles.includes("Leads"), "false", String(titles.includes("Leads"))),
          check("no_jobs", "No FieldFlow Jobs page", !titles.includes("Jobs"), "false", String(titles.includes("Jobs"))),
        ];
      });

    default:
      return {
        ...def,
        passed: false,
        durationMs: 0,
        checks: [],
        error: `Unknown app creation case: ${def.id}`,
      };
  }
}

export async function runAllAppCreationCases(): Promise<BenchmarkCaseResult[]> {
  const results: BenchmarkCaseResult[] = [];
  for (const def of APP_CREATION_CASES) {
    results.push(await runAppCreationCase(def));
  }
  return results;
}
