import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateGreenfieldProject } from "@/core/greenfield/fileValidation";
import {
  buildMissingFilesPrompt,
  buildLeanCriticalFilePrompt,
  parseGreenfieldFileMarkers,
  parseGreenfieldPartial,
  parseGreenfieldWithRepair,
} from "@/core/greenfield/parseResponse";
import { GREENFIELD_FILE_PATHS, type GeneratedFile } from "@/core/greenfield/types";

function marker(path: string, content: string): string {
  return `@@FILE:${path}@@\n${content}\n@@END:${path}@@`;
}

function allSevenFiles(): GeneratedFile[] {
  return GREENFIELD_FILE_PATHS.map((path) => ({
    path,
    content:
      path === "package.json"
        ? JSON.stringify({
            name: "app",
            scripts: { dev: "vite", build: "tsc && vite build", typecheck: "tsc", preview: "vite preview" },
            dependencies: { react: "^18.3.1", "react-dom": "^18.3.1" },
            devDependencies: {
              vite: "^5.3.1",
              typescript: "^5.4.5",
              "@vitejs/plugin-react": "^5.0.0",
              "@types/react": "^18.3.3",
              "@types/react-dom": "^18.3.0",
            },
          })
        : path === "index.html"
          ? '<div id="root"></div><script type="module" src="/src/main.tsx"></script>'
          : path === "src/main.tsx"
            ? 'import App from "./App"; createRoot(document.getElementById("root")!).render(<App />);'
            : path === "src/App.tsx"
              ? "export default function App(){return <div/>}"
              : path === "tsconfig.json"
                ? '{"compilerOptions":{"jsx":"react-jsx","strict":true,"noEmit":true},"include":["src","vite.config.ts"]}'
                : path === "vite.config.ts"
                  ? 'import { defineConfig } from "vite"; import react from "@vitejs/plugin-react"; export default defineConfig({ plugins: [react()] });'
                  : "body{}",
  }));
}

describe("greenfield generate reliability", () => {
  it("detects missing file references in partial project", () => {
    const partial = allSevenFiles().filter((f) => f.path !== "src/App.tsx");
    const validation = validateGreenfieldProject(partial);
    assert.equal(validation.ok, false);
    assert.ok(validation.missingFiles.includes("src/App.tsx"));
  });

  it("accepts recovered file content even when end marker is missing", () => {
    const files = allSevenFiles();
    const validation = validateGreenfieldProject(files, ["src/App.tsx"]);
    assert.equal(validation.ok, true);
    assert.deepEqual(validation.malformedMarkers, []);
  });

  it("detects malformed file markers", () => {
    const raw = marker("package.json", "{}") + "\n" + marker("index.html", "<html/>");
    const audit = parseGreenfieldWithRepair(raw);
    assert.equal(audit.files, null);
    assert.ok(audit.markerAudit.missingFiles.length > 0);
    const validation = validateGreenfieldProject(audit.partial, audit.markerAudit.missingFiles);
    assert.equal(validation.ok, false);
  });

  it("parses complete marker output", () => {
    const files = allSevenFiles();
    const raw = files.map((f) => marker(f.path, f.content)).join("\n\n");
    const parsed = parseGreenfieldFileMarkers(raw);
    assert.ok(parsed);
    assert.equal(parsed!.length, 7);
    const validation = validateGreenfieldProject(parsed);
    assert.equal(validation.ok, true);
  });

  it("recovers partial generation and lists missing paths", () => {
    const files = allSevenFiles().slice(0, 4);
    const raw = files.map((f) => marker(f.path, f.content)).join("\n\n");
    const partial = parseGreenfieldPartial(raw);
    assert.equal(partial.length, 4);
    const validation = validateGreenfieldProject(partial);
    assert.equal(validation.ok, false);
    assert.ok(validation.missingFiles.length >= 3);
  });

  it("builds missing-files repair prompt", () => {
    const existing = allSevenFiles().slice(0, 2);
    const prompt = buildMissingFilesPrompt(
      "Build a calculator",
      ["src/App.tsx"],
      existing,
    );
    assert.match(prompt, /Missing files: src\/App\.tsx/);
    assert.match(prompt, /Build a calculator/);
    assert.match(prompt, /reference only/i);
    assert.doesNotMatch(prompt, /@@FILE:package\.json@@\n{\n/);
  });

  it("builds lean critical file prompt without embedding full css", () => {
    const existing = allSevenFiles();
    const prompt = buildLeanCriticalFilePrompt(
      "Create a React TypeScript Vite app called FieldFlow.\n\nPages:\n1. Dashboard\n2. Leads",
      ["src/App.tsx"],
      existing,
    );
    assert.match(prompt, /Return ONLY these file/);
    assert.match(prompt, /src\/index.css: full layout/i);
    assert.doesNotMatch(prompt, /\.sidebar-nav a:hover/);
  });

  it("accepts more than seven marker blocks by ignoring unexpected paths", () => {
    const files = allSevenFiles();
    const extra = marker("src/components/Bonus.tsx", "export {}");
    const raw = files.map((f) => marker(f.path, f.content)).join("\n\n") + "\n" + extra;
    const outcome = parseGreenfieldWithRepair(raw);
    assert.equal(outcome.files?.length, 7);
    assert.ok(outcome.diagnostics.unexpectedFiles.includes("src/components/Bonus.tsx"));
  });

  it("repairs JSON/markdown wrapped marker blocks", () => {
    const inner = allSevenFiles().map((f) => marker(f.path, f.content)).join("\n");
    const wrapped = "```json\n" + inner + "\n```";
    const outcome = parseGreenfieldWithRepair(wrapped);
    assert.ok(outcome.files);
    assert.equal(outcome.files!.length, 7);
  });

  it("pipeline completes when invoke returns valid seven-file project", async () => {
    const files = allSevenFiles();
    const { runGreenfieldGenerateWithReliability } = await import(
      "@/core/greenfield/generatePipeline"
    );
    const { normalizeProviderSettings } = await import("@/core/providers/orchestration");
    const settings = normalizeProviderSettings({
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
    const raw = files.map((f) => marker(f.path, f.content)).join("\n\n");
    const result = await runGreenfieldGenerateWithReliability(
      {
        api: {
          greenfieldGenerate: async () => ({
            ok: true,
            provider: "gemini",
            model: "gemini-2.5-flash",
            files,
            rawText: raw,
            latencyMs: 12,
          }),
        } as never,
        settings,
        invokeGreenfieldCall: async (_s, _t, call) => call("gemini") as never,
      },
      "Build a calculator app",
    );
    assert.equal(result.ok, true);
    assert.equal(result.files?.length, 7);
  });

  it("pipeline retries when files are partial then succeeds", async () => {
    const complete = allSevenFiles();
    const partial = complete.slice(0, 3);
    const rawPartial = partial.map((f) => marker(f.path, f.content)).join("\n\n");
    const rawComplete = complete.map((f) => marker(f.path, f.content)).join("\n\n");
    let calls = 0;
    const { runGreenfieldGenerateWithReliability } = await import(
      "@/core/greenfield/generatePipeline"
    );
    const { normalizeProviderSettings } = await import("@/core/providers/orchestration");
    const settings = normalizeProviderSettings({
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
    const result = await runGreenfieldGenerateWithReliability(
      {
        api: {
          greenfieldGenerate: async () => {
            calls += 1;
            if (calls === 1) {
              return {
                ok: true,
                provider: "gemini",
                model: "gemini-2.5-flash",
                rawText: rawPartial,
                latencyMs: 10,
              };
            }
            return {
              ok: true,
              provider: "gemini",
              model: "gemini-2.5-flash",
              files: complete,
              rawText: rawComplete,
              latencyMs: 10,
            };
          },
        } as never,
        settings,
        invokeGreenfieldCall: async (_s, _t, call) => call("gemini") as never,
      },
      "Build a todo app",
    );
    assert.equal(calls, 2);
    assert.equal(result.ok, true);
  });

  it("blocks local App scaffold when provider recovers fewer than six files", async () => {
    const partial = allSevenFiles().slice(0, 4);
    const rawPartial = partial.map((f) => marker(f.path, f.content)).join("\n\n");
    const { runGreenfieldGenerateWithReliability } = await import(
      "@/core/greenfield/generatePipeline"
    );
    const { normalizeProviderSettings } = await import("@/core/providers/orchestration");
    const settings = normalizeProviderSettings({
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
    const result = await runGreenfieldGenerateWithReliability(
      {
        api: {
          greenfieldGenerate: async () => ({
            ok: false,
            provider: "gemini",
            model: "gemini-2.5-flash",
            rawText: rawPartial,
            latencyMs: 10,
            error: "Greenfield parse incomplete: parsed 4/7 expected files.",
          }),
        } as never,
        settings,
        invokeGreenfieldCall: async (_s, _t, call) => call("gemini") as never,
      },
      "Build a FieldFlow app",
    );
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /blocked|skeleton/i);
    assert.equal(result.fallbackSkeletonUsed, true);
  });

  it("partial parse with real App.tsx succeeds when only non-app files use skeleton", async () => {
    const partial = allSevenFiles().filter(
      (f) => f.path !== "vite.config.ts" && f.path !== "src/index.css",
    );
    const rawPartial = partial.map((f) => marker(f.path, f.content)).join("\n\n");
    const { runGreenfieldGenerateWithReliability } = await import(
      "@/core/greenfield/generatePipeline"
    );
    const { normalizeProviderSettings } = await import("@/core/providers/orchestration");
    const settings = normalizeProviderSettings({
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
    const result = await runGreenfieldGenerateWithReliability(
      {
        api: {
          greenfieldGenerate: async () => ({
            ok: false,
            provider: "gemini",
            model: "gemini-2.5-flash",
            rawText: rawPartial,
            latencyMs: 10,
            error: "Greenfield parse incomplete: parsed 5/7 expected files.",
          }),
        } as never,
        settings,
        invokeGreenfieldCall: async (_s, _t, call) => call("gemini") as never,
      },
      "Build a FieldFlow app",
    );
    assert.equal(result.ok, true);
    assert.equal(result.files?.length, 7);
    assert.equal(result.partialSuccess, true);
    assert.equal(result.fallbackSkeletonUsed, true);
  });

  it("returns explicit budget stop reason when provider invoke is blocked", async () => {
    const { runGreenfieldGenerateWithReliability } = await import(
      "@/core/greenfield/generatePipeline"
    );
    const { normalizeProviderSettings } = await import("@/core/providers/orchestration");
    const settings = normalizeProviderSettings({
      provider: "gemini",
      geminiModel: "gemini-2.5-pro",
      hasGeminiKey: true,
      hasAnthropicKey: false,
      hasGroqKey: false,
      hasOpenRouterKey: false,
      ollamaModel: "qwen2.5-coder:7b",
      ollamaBaseUrl: "http://localhost:11434",
      anthropicModel: "claude-sonnet-4-6",
      groqModel: "llama-3.3-70b-versatile",
      openrouterModel: "anthropic/claude-sonnet-4",
    } as import("@/core/providers/types").ProviderSettings);
    const stopRef = { current: "Provider budget exceeded (max 12 AI calls per run)." };
    const sentRef = { current: false };
    const result = await runGreenfieldGenerateWithReliability(
      {
        api: { greenfieldGenerate: async () => ({ ok: false, provider: "gemini", model: "x", latencyMs: 0 }) } as never,
        settings,
        invokeGreenfieldCall: async () => {
          stopRef.current = "Provider budget exceeded (max 12 AI calls per run).";
          return null;
        },
        providerStopReasonRef: stopRef,
        providerRequestSentRef: sentRef,
      },
      "Build a large app",
    );
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /budget/i);
    assert.equal(result.exactFailureStage, "budget");
    assert.equal(result.providerRequestSent, false);
  });

  it("returns budget stop reason when generation loop is blocked before any provider call", async () => {
    const { runGreenfieldGenerateWithReliability } = await import(
      "@/core/greenfield/generatePipeline"
    );
    const { AiCallTracker } = await import("@/core/providers/costControls");
    const { configureGreenfieldCallReservations } = await import(
      "@/core/providers/greenfieldCallBudget"
    );
    const settings = await settingsWithMaxCalls(3);
    const tracker = new AiCallTracker();
    configureGreenfieldCallReservations(tracker, settings);
    tracker.tryRecordCall(settings, { purpose: "primary", stage: "greenfield" });
    tracker.tryRecordCall(settings, { purpose: "retry", stage: "greenfield" });
    let invokeCount = 0;
    const result = await runGreenfieldGenerateWithReliability(
      {
        api: { greenfieldGenerate: async () => ({ ok: false, provider: "gemini", model: "x", latencyMs: 0 }) } as never,
        settings,
        invokeGreenfieldCall: async () => {
          invokeCount += 1;
          return null;
        },
        canMakeAiCall: (purpose) => {
          const gate = tracker.canMakeCall(settings, { purpose, stage: "greenfield" });
          return gate.ok ? { ok: true } : { ok: false, reason: gate.reason };
        },
      },
      "Build FieldFlow",
    );
    assert.equal(invokeCount, 0);
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /reserve 1 call\(s\) for setup repair/i);
    assert.equal(result.exactFailureStage, "budget");
  });

  it("blocks zero-file fallback skeleton when parser returns nothing usable", async () => {
    const { runGreenfieldGenerateWithReliability } = await import(
      "@/core/greenfield/generatePipeline"
    );
    const { normalizeProviderSettings } = await import("@/core/providers/orchestration");
    const settings = normalizeProviderSettings({
      provider: "anthropic",
      geminiModel: "gemini-2.5-flash",
      hasGeminiKey: false,
      hasAnthropicKey: true,
      hasGroqKey: false,
      hasOpenRouterKey: false,
      ollamaModel: "qwen2.5-coder:7b",
      ollamaBaseUrl: "http://localhost:11434",
      anthropicModel: "claude-haiku-4-5-20251001",
      groqModel: "llama-3.3-70b-versatile",
      openrouterModel: "anthropic/claude-sonnet-4",
    } as import("@/core/providers/types").ProviderSettings);
    const result = await runGreenfieldGenerateWithReliability(
      {
        api: {
          greenfieldGenerate: async () => ({
            ok: false,
            provider: "anthropic",
            model: "claude-haiku-4-5-20251001",
            rawText: "Here is a description of your app without file markers.",
            latencyMs: 4000,
            error: "Greenfield parse incomplete: parsed 0/7 expected files.",
          }),
        } as never,
        settings,
        invokeGreenfieldCall: async (_s, _t, call) => call("anthropic") as never,
      },
      "Build FieldFlow",
    );
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /blocked|skeleton/i);
    assert.equal(result.files?.length, 7);
    assert.equal(result.fallbackSkeletonUsed, true);
    assert.ok(result.parseTrace);
    assert.ok((result.parseTrace?.rawResponseLength ?? 0) > 0);
  });

  it("parses alternate path-before-fence format from provider output", async () => {
    const alt = `src/App.tsx
\`\`\`tsx
export default function App(){return <div>FieldFlow</div>}
\`\`\``;
    const { runGreenfieldGenerateWithReliability } = await import(
      "@/core/greenfield/generatePipeline"
    );
    const { normalizeProviderSettings } = await import("@/core/providers/orchestration");
    const settings = normalizeProviderSettings({
      provider: "gemini",
      geminiModel: "gemini-2.5-flash",
      hasGeminiKey: true,
      hasAnthropicKey: false,
      hasGroqKey: false,
      hasOpenRouterKey: false,
      ollamaModel: "qwen2.5-coder:7b",
      ollamaBaseUrl: "http://localhost:11434",
      anthropicModel: "claude-sonnet-4-6",
      groqModel: "llama-3.3-70b-versatile",
      openrouterModel: "anthropic/claude-sonnet-4",
    } as import("@/core/providers/types").ProviderSettings);
    const result = await runGreenfieldGenerateWithReliability(
      {
        api: {
          greenfieldGenerate: async () => ({
            ok: true,
            provider: "gemini",
            model: "gemini-2.5-flash",
            rawText: alt,
            latencyMs: 12,
          }),
        } as never,
        settings,
        invokeGreenfieldCall: async (_s, _t, call) => call("gemini") as never,
      },
      "Build FieldFlow",
    );
    assert.equal(result.ok, true);
    const app = result.files?.find((f) => f.path === "src/App.tsx");
    assert.ok(app?.content.includes("FieldFlow"));
    assert.equal(result.parseTrace?.bestPattern, "format_f_path_before_fence");
  });

  it("classifies provider unavailable when invoke returns null", async () => {
    const { runGreenfieldGenerateWithReliability } = await import(
      "@/core/greenfield/generatePipeline"
    );
    const { normalizeProviderSettings } = await import("@/core/providers/orchestration");
    const { PROVIDER_UNAVAILABLE_NO_OUTPUT_MESSAGE } = await import(
      "@/core/greenfield/parseErrors"
    );
    const settings = normalizeProviderSettings({
      provider: "gemini",
      geminiModel: "gemini-2.5-pro",
      hasGeminiKey: true,
      hasAnthropicKey: false,
      hasGroqKey: false,
      hasOpenRouterKey: false,
      ollamaModel: "qwen2.5-coder:7b",
      ollamaBaseUrl: "http://localhost:11434",
      anthropicModel: "claude-sonnet-4-6",
      groqModel: "llama-3.3-70b-versatile",
      openrouterModel: "anthropic/claude-sonnet-4",
    } as import("@/core/providers/types").ProviderSettings);
    const stopRef = {
      current: "gemini is temporarily degraded. Using backup if available.",
    };
    const result = await runGreenfieldGenerateWithReliability(
      {
        api: { greenfieldGenerate: async () => ({ ok: false, provider: "gemini", model: "x", latencyMs: 0 }) } as never,
        settings,
        invokeGreenfieldCall: async () => {
          stopRef.current =
            "gemini is temporarily degraded. Using backup if available.";
          return null;
        },
        providerStopReasonRef: stopRef,
      },
      "Build FieldFlow",
    );
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", new RegExp(PROVIDER_UNAVAILABLE_NO_OUTPUT_MESSAGE.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  });

  it("skips provider repair when generation retry budget is exhausted", async () => {
    const { runGreenfieldGenerateWithReliability } = await import(
      "@/core/greenfield/generatePipeline"
    );
    const { retryBlockedDueToBudgetReason } = await import(
      "@/core/providers/greenfieldCallBudget"
    );
    const settings = await settingsWithMaxCalls(1);
    let invokeCount = 0;
    const result = await runGreenfieldGenerateWithReliability(
      {
        api: {
          greenfieldGenerate: async () => ({
            ok: true,
            provider: "gemini",
            model: "gemini-2.5-flash",
            rawText: "No file markers in this prose-only response.",
            latencyMs: 5,
          }),
        } as never,
        settings,
        invokeGreenfieldCall: async (_s, _t, call) => {
          invokeCount += 1;
          return call("gemini") as never;
        },
        canMakeAiCall: (purpose) =>
          purpose === "retry"
            ? { ok: false, reason: retryBlockedDueToBudgetReason(1, 0) }
            : { ok: true },
      },
      "Build FieldFlow",
    );
    assert.equal(result.ok, false);
    assert.match(result.error ?? "", /blocked|skeleton/i);
    assert.equal(result.fallbackSkeletonUsed, true);
    assert.ok(result.warnings?.some((w) => /retry blocked|Provider retry blocked/i.test(w)));
    assert.equal(invokeCount, 1);
  });

  it("stops generation retries before exhausting repair reserve when max is 3", async () => {
    const { runGreenfieldGenerateWithReliability } = await import(
      "@/core/greenfield/generatePipeline"
    );
    const { AiCallTracker } = await import("@/core/providers/costControls");
    const { configureGreenfieldCallReservations } = await import(
      "@/core/providers/greenfieldCallBudget"
    );
    const settings = await settingsWithMaxCalls(3);
    const tracker = new AiCallTracker();
    configureGreenfieldCallReservations(tracker, settings);
    const partial = allSevenFiles().filter((file) => file.path !== "src/App.tsx");
    const rawPartial = partial.map((f) => marker(f.path, f.content)).join("\n\n");
    let calls = 0;
    const result = await runGreenfieldGenerateWithReliability(
      {
        api: {
          greenfieldGenerate: async () => ({
            ok: true,
            provider: "gemini",
            model: "gemini-2.5-flash",
            rawText: rawPartial,
            latencyMs: 10,
            error: "Greenfield parse incomplete: parsed 6/7 expected files. Missing: [src/App.tsx].",
          }),
        } as never,
        settings,
        invokeGreenfieldCall: async (_s, _t, call, _prompt, purpose = "primary") => {
          const gate = tracker.canMakeCall(settings, { purpose, stage: "greenfield" });
          if (!gate.ok) return null;
          const recorded = tracker.tryRecordCall(settings, { purpose, stage: "greenfield" });
          if (!recorded.ok) return null;
          calls += 1;
          return call("gemini") as never;
        },
        canMakeAiCall: (purpose) => {
          const gate = tracker.canMakeCall(settings, { purpose, stage: "greenfield" });
          return gate.ok ? { ok: true } : { ok: false, reason: gate.reason };
        },
      },
      "Build FieldFlow",
    );
    assert.equal(calls, 2);
    assert.equal(tracker.budget(settings).remainingCalls, 1);
    assert.equal(result.ok, true);
    assert.equal(result.files?.length, 7);
  });

  it("prefers lean App.tsx repair over generic missing-file retry when six files parse", async () => {
    const { runGreenfieldGenerateWithReliability } = await import(
      "@/core/greenfield/generatePipeline"
    );
    const { AiCallTracker } = await import("@/core/providers/costControls");
    const { configureGreenfieldCallReservations } = await import(
      "@/core/providers/greenfieldCallBudget"
    );
    const settings = await settingsWithMaxCalls(3);
    const tracker = new AiCallTracker();
    configureGreenfieldCallReservations(tracker, settings);
    const partial = allSevenFiles().filter((file) => file.path !== "src/App.tsx");
    const rawPartial = partial.map((f) => marker(f.path, f.content)).join("\n\n");
    const purposes: Array<"primary" | "retry" | "repair"> = [];
    const result = await runGreenfieldGenerateWithReliability(
      {
        api: {
          greenfieldGenerate: async () => ({
            ok: true,
            provider: "gemini",
            model: "gemini-2.5-flash",
            rawText: rawPartial,
            latencyMs: 10,
            error: "Greenfield parse incomplete: parsed 6/7 expected files. Missing: [src/App.tsx].",
          }),
        } as never,
        settings,
        invokeGreenfieldCall: async (_s, _t, call, _prompt, purpose = "primary") => {
          purposes.push(purpose);
          const gate = tracker.canMakeCall(settings, { purpose, stage: "greenfield" });
          if (!gate.ok) return null;
          const recorded = tracker.tryRecordCall(settings, { purpose, stage: "greenfield" });
          if (!recorded.ok) return null;
          return call("gemini") as never;
        },
        canMakeAiCall: (purpose) => {
          const gate = tracker.canMakeCall(settings, { purpose, stage: "greenfield" });
          return gate.ok ? { ok: true } : { ok: false, reason: gate.reason };
        },
      },
      "Build FieldFlow",
    );
    assert.equal(result.ok, true);
    assert.deepEqual(purposes, ["primary", "repair"]);
  });

  it("uses lean App repair when five of seven files parse on first response", async () => {
    const { runGreenfieldGenerateWithReliability } = await import(
      "@/core/greenfield/generatePipeline"
    );
    const { AiCallTracker } = await import("@/core/providers/costControls");
    const { configureGreenfieldCallReservations } = await import(
      "@/core/providers/greenfieldCallBudget"
    );
    const settings = await settingsWithMaxCalls(3);
    const tracker = new AiCallTracker();
    configureGreenfieldCallReservations(tracker, settings);
    const fiveFiles = allSevenFiles().filter(
      (file) => file.path !== "src/App.tsx" && file.path !== "src/index.css",
    );
    const rawFive = fiveFiles.map((f) => marker(f.path, f.content)).join("\n\n");
    const prompts: string[] = [];
    const purposes: Array<"primary" | "retry" | "repair"> = [];
    await runGreenfieldGenerateWithReliability(
      {
        api: {
          greenfieldGenerate: async () => ({
            ok: true,
            provider: "gemini",
            model: "gemini-2.5-flash",
            rawText: rawFive,
            latencyMs: 10,
            error: "Greenfield parse incomplete: parsed 5/7 expected files.",
          }),
        } as never,
        settings,
        invokeGreenfieldCall: async (_s, _t, call, prompt = "", purpose = "primary") => {
          prompts.push(prompt);
          purposes.push(purpose);
          const gate = tracker.canMakeCall(settings, { purpose, stage: "greenfield" });
          if (!gate.ok) return null;
          tracker.tryRecordCall(settings, { purpose, stage: "greenfield" });
          return call("gemini") as never;
        },
        canMakeAiCall: (purpose) => {
          const gate = tracker.canMakeCall(settings, { purpose, stage: "greenfield" });
          return gate.ok ? { ok: true } : { ok: false, reason: gate.reason };
        },
      },
      "Build FieldFlow",
    );
    assert.deepEqual(purposes, ["primary", "repair"]);
    assert.match(prompts[1] ?? "", /Greenfield generation truncated before completing the app entry file/);
    assert.doesNotMatch(prompts[1] ?? "", /previous greenfield response was incomplete/i);
  });

  it("uses reserved completion call before scaffold when App.tsx stays missing", async () => {
    const { runGreenfieldGenerateWithReliability } = await import(
      "@/core/greenfield/generatePipeline"
    );
    const { AiCallTracker } = await import("@/core/providers/costControls");
    const { configureGreenfieldCallReservations } = await import(
      "@/core/providers/greenfieldCallBudget"
    );
    const { isFallbackSkeletonAppContent } = await import("@/core/greenfield/fallbackSkeleton");
    const settings = await settingsWithMaxCalls(3);
    const tracker = new AiCallTracker();
    configureGreenfieldCallReservations(tracker, settings);
    const partial = allSevenFiles().filter((file) => file.path !== "src/App.tsx");
    const rawPartial = partial.map((f) => marker(f.path, f.content)).join("\n\n");
    const appOnly = marker(
      "src/App.tsx",
      `export default function App() {
  return <div className="app-layout"><h1>FieldFlow Complete</h1></div>;
}`,
    );
    let completionCalls = 0;
    const result = await runGreenfieldGenerateWithReliability(
      {
        api: {
          greenfieldGenerate: async () => ({
            ok: true,
            provider: "gemini",
            model: "gemini-2.5-flash",
            rawText: rawPartial,
            latencyMs: 10,
            error: "Greenfield parse incomplete: parsed 6/7 expected files. Missing: [src/App.tsx].",
          }),
        } as never,
        settings,
        invokeGreenfieldCall: async (_s, _t, call, _prompt, purpose = "primary") => {
          const gate = tracker.canMakeCall(settings, { purpose, stage: "greenfield" });
          if (!gate.ok) return null;
          tracker.tryRecordCall(settings, { purpose, stage: "greenfield" });
          return call("gemini") as never;
        },
        canMakeAiCall: (purpose) => {
          const gate = tracker.canMakeCall(settings, { purpose, stage: "greenfield" });
          return gate.ok ? { ok: true } : { ok: false, reason: gate.reason };
        },
        canMakeAppCompletionCall: () => {
          const gate = tracker.canMakeCall(settings, { purpose: "primary", stage: "repair" });
          return gate.ok ? { ok: true } : { ok: false, reason: gate.reason };
        },
        invokeAppCompletionCall: async (_s, _t, _call) => {
          completionCalls += 1;
          tracker.tryRecordCall(settings, { purpose: "primary", stage: "repair" });
          return {
            ok: true,
            provider: "gemini",
            model: "gemini-2.5-flash",
            rawText: appOnly,
            latencyMs: 10,
          } as never;
        },
      },
      "Build FieldFlow",
    );
    assert.equal(completionCalls, 1);
    assert.equal(result.ok, true);
    assert.match(
      result.files?.find((f) => f.path === "src/App.tsx")?.content ?? "",
      /FieldFlow Complete/,
    );
    assert.equal(
      isFallbackSkeletonAppContent(
        result.files?.find((f) => f.path === "src/App.tsx")?.content ?? "",
      ),
      false,
    );
    assert.equal(result.appShellIncomplete, false);
  });

  it("skips malformed repair when reserved App completion is available", async () => {
    const { runGreenfieldGenerateWithReliability } = await import(
      "@/core/greenfield/generatePipeline"
    );
    const { AiCallTracker } = await import("@/core/providers/costControls");
    const { configureGreenfieldCallReservations } = await import(
      "@/core/providers/greenfieldCallBudget"
    );
    const settings = await settingsWithMaxCalls(3);
    const tracker = new AiCallTracker();
    configureGreenfieldCallReservations(tracker, settings);
    const partial = allSevenFiles().filter((file) => file.path !== "src/App.tsx");
    const rawPartial = partial.map((f) => marker(f.path, f.content)).join("\n\n");
    const appOnly = marker(
      "src/App.tsx",
      `export default function App(){return <div className="app-layout"><h1>FieldFlow Complete</h1></div>;}`,
    );
    const purposes: Array<"primary" | "retry" | "repair"> = [];
    let completionCalls = 0;
    const result = await runGreenfieldGenerateWithReliability(
      {
        api: {
          greenfieldGenerate: async () => ({
            ok: true,
            provider: "gemini",
            model: "gemini-2.5-flash",
            rawText: rawPartial,
            latencyMs: 10,
            error: "Greenfield parse incomplete: parsed 6/7 expected files. Missing: [src/App.tsx].",
          }),
        } as never,
        settings,
        invokeGreenfieldCall: async (_s, _t, call, _prompt, purpose = "primary") => {
          purposes.push(purpose);
          const gate = tracker.canMakeCall(settings, { purpose, stage: "greenfield" });
          if (!gate.ok) return null;
          tracker.tryRecordCall(settings, { purpose, stage: "greenfield" });
          return call("gemini") as never;
        },
        canMakeAiCall: (purpose) => {
          const gate = tracker.canMakeCall(settings, { purpose, stage: "greenfield" });
          return gate.ok ? { ok: true } : { ok: false, reason: gate.reason };
        },
        canMakeAppCompletionCall: () => {
          const gate = tracker.canMakeCall(settings, { purpose: "primary", stage: "repair" });
          return gate.ok ? { ok: true } : { ok: false, reason: gate.reason };
        },
        invokeAppCompletionCall: async () => {
          completionCalls += 1;
          tracker.tryRecordCall(settings, { purpose: "primary", stage: "repair" });
          return {
            ok: true,
            provider: "gemini",
            model: "gemini-2.5-flash",
            rawText: appOnly,
            latencyMs: 10,
          } as never;
        },
      },
      "Build FieldFlow",
    );
    assert.deepEqual(purposes, ["primary"]);
    assert.equal(completionCalls, 1);
    assert.equal(result.ok, true);
    assert.match(
      result.files?.find((f) => f.path === "src/App.tsx")?.content ?? "",
      /FieldFlow Complete/,
    );
  });

  it("ignores junk reserved completion output that re-emits scaffold files", async () => {
    const { runGreenfieldGenerateWithReliability } = await import(
      "@/core/greenfield/generatePipeline"
    );
    const { AiCallTracker } = await import("@/core/providers/costControls");
    const { configureGreenfieldCallReservations } = await import(
      "@/core/providers/greenfieldCallBudget"
    );
    const settings = await settingsWithMaxCalls(3);
    const tracker = new AiCallTracker();
    configureGreenfieldCallReservations(tracker, settings);
    const partial = allSevenFiles().filter((file) => file.path !== "src/App.tsx");
    const rawPartial = partial.map((f) => marker(f.path, f.content)).join("\n\n");
    const goodMain = partial.find((f) => f.path === "src/main.tsx")!.content;
    const junkCompletion = [
      marker("package.json", '{"name":"junk"}'),
      marker("index.html", "<html></html>"),
      "@@FILE:src/main.tsx@@\nimport broken\n",
    ].join("\n\n");
    const result = await runGreenfieldGenerateWithReliability(
      {
        api: {
          greenfieldGenerate: async () => ({
            ok: true,
            provider: "gemini",
            model: "gemini-2.5-flash",
            rawText: rawPartial,
            latencyMs: 10,
            error: "Greenfield parse incomplete: parsed 6/7 expected files. Missing: [src/App.tsx].",
          }),
        } as never,
        settings,
        invokeGreenfieldCall: async (_s, _t, call, _prompt, purpose = "primary") => {
          const gate = tracker.canMakeCall(settings, { purpose, stage: "greenfield" });
          if (!gate.ok) return null;
          tracker.tryRecordCall(settings, { purpose, stage: "greenfield" });
          return call("gemini") as never;
        },
        canMakeAiCall: (purpose) => {
          const gate = tracker.canMakeCall(settings, { purpose, stage: "greenfield" });
          return gate.ok ? { ok: true } : { ok: false, reason: gate.reason };
        },
        canMakeAppCompletionCall: () => {
          const gate = tracker.canMakeCall(settings, { purpose: "primary", stage: "repair" });
          return gate.ok ? { ok: true } : { ok: false, reason: gate.reason };
        },
        invokeAppCompletionCall: async () => {
          tracker.tryRecordCall(settings, { purpose: "primary", stage: "repair" });
          return {
            ok: true,
            provider: "gemini",
            model: "gemini-2.5-flash",
            rawText: junkCompletion,
            latencyMs: 10,
          } as never;
        },
      },
      "Build FieldFlow",
    );
    assert.equal(result.files?.find((f) => f.path === "src/main.tsx")?.content, goodMain);
    assert.match(
      result.files?.find((f) => f.path === "src/App.tsx")?.content ?? "",
      /FieldFlow|Dashboard|app-layout/i,
    );
  });

  it("uses local App scaffold when six provider files parse and App.tsx stays missing", async () => {
    const partial = allSevenFiles().filter((file) => file.path !== "src/App.tsx");
    const rawPartial = partial.map((f) => marker(f.path, f.content)).join("\n\n");
    const { runGreenfieldGenerateWithReliability } = await import(
      "@/core/greenfield/generatePipeline"
    );
    const settings = await settingsWithMaxCalls(3);
    let calls = 0;
    const result = await runGreenfieldGenerateWithReliability(
      {
        api: {
          greenfieldGenerate: async () => ({
            ok: true,
            provider: "gemini",
            model: "gemini-2.5-pro",
            rawText: rawPartial,
            latencyMs: 10,
            error: "Greenfield parse incomplete: parsed 6/7 expected files. Missing: [src/App.tsx].",
          }),
        } as never,
        settings,
        invokeGreenfieldCall: async (_s, _t, call, _prompt, purpose = "primary") => {
          calls += 1;
          if (purpose === "repair") {
            return {
              ok: true,
              provider: "gemini",
              model: "gemini-2.5-pro",
              rawText: rawPartial,
              latencyMs: 10,
              error: "Greenfield parse incomplete: parsed 6/7 expected files. Missing: [src/App.tsx].",
            } as never;
          }
          return call("gemini") as never;
        },
        canMakeAiCall: (purpose) => {
          if (purpose === "retry" && calls >= 2) {
            return { ok: false, reason: "retry blocked" };
          }
          if (purpose === "repair" && calls >= 3) {
            return { ok: false, reason: "repair blocked" };
          }
          return { ok: true };
        },
      },
      "Create a React TypeScript Vite notes app with a single list page.",
    );
    assert.equal(result.ok, true);
    assert.equal(result.files?.length, 7);
    assert.match(result.files?.find((f) => f.path === "src/App.tsx")?.content ?? "", /notes|Notes|app/i);
    assert.ok(result.warnings?.some((w) => /local scaffold/i.test(w)));
  });

  it("recovers truncated App.tsx from raw response instead of skeleton fallback", async () => {
    const sixFiles = allSevenFiles().filter((file) => file.path !== "src/App.tsx");
    const truncatedApp = `@@FILE:src/App.tsx@@
import { BrowserRouter, Routes, Route } from "react-router-dom";

export default function App() {
  return (
    <div className="flex min-h-screen bg-slate-900 text-white">
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<h1>FieldFlow</h1>} />
        </Routes>
      </BrowserRouter>
    </div>
  );
`;
    const rawPartial = `${sixFiles.map((f) => marker(f.path, f.content)).join("\n\n")}\n\n${truncatedApp}`;
    const { runGreenfieldGenerateWithReliability } = await import(
      "@/core/greenfield/generatePipeline"
    );
    const { normalizeProviderSettings } = await import("@/core/providers/orchestration");
    const { isFallbackSkeletonAppContent } = await import("@/core/greenfield/fallbackSkeleton");
    const settings = normalizeProviderSettings({
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
    const result = await runGreenfieldGenerateWithReliability(
      {
        api: {
          greenfieldGenerate: async () => ({
            ok: true,
            provider: "gemini",
            model: "gemini-2.5-flash",
            rawText: rawPartial,
            latencyMs: 12,
          }),
        } as never,
        settings,
        invokeGreenfieldCall: async (_s, _t, call) => call("gemini") as never,
        canMakeAiCall: () => ({ ok: true }),
      },
      "Build FieldFlow",
    );
    assert.equal(result.ok, true);
    assert.equal(result.files?.length, 7);
    const app = result.files?.find((file) => file.path === "src/App.tsx");
    assert.ok(app);
    assert.match(app.content, /FieldFlow/);
    assert.equal(isFallbackSkeletonAppContent(app.content), false);
    assert.equal(result.appShellIncomplete, false);
    assert.ok(result.recoveredPartialPaths?.includes("src/App.tsx"));
  });
});

async function settingsWithMaxCalls(maxAiCalls: number) {
  const { normalizeProviderSettings } = await import("@/core/providers/orchestration");
  return normalizeProviderSettings({
    provider: "gemini",
    geminiModel: "gemini-2.5-flash",
    hasGeminiKey: true,
    maxAiCalls,
  } as import("@/core/providers/types").ProviderSettings);
}
