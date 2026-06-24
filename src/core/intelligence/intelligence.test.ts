import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildProjectIntelligenceContext } from "@/core/intelligence/buildContext";
import { analyzeFeasibility } from "@/core/intelligence/feasibility";
import { buildFeatureInventoryFromScan } from "@/core/intelligence/featureInventory";
import {
  resolveComplexityRouting,
  scoreComplexity,
} from "@/core/intelligence/complexityRouting";
import { emptySessionMemory } from "@/core/sessionMemory";
import { mockProjectScan } from "@/core/repository/testScan";
import { normalizeProviderSettings } from "@/core/providers/orchestration";
import type { ProviderSettings } from "@/core/providers/types";

function baseSettings(patch: Partial<ProviderSettings> = {}): ProviderSettings {
  return normalizeProviderSettings({
    provider: "gemini",
    geminiModel: "gemini-2.0-flash",
    ollamaModel: "qwen2.5-coder:7b",
    ollamaBaseUrl: "http://localhost:11434",
    anthropicModel: "claude-sonnet-4-20250514",
    groqModel: "llama-3.3-70b-versatile",
    openrouterModel: "anthropic/claude-sonnet-4",
    hasGeminiKey: true,
    hasAnthropicKey: true,
    hasGroqKey: false,
    hasOpenRouterKey: true,
    autoFixMode: "ask",
    agentMode: "single",
    plannerProvider: "gemini",
    plannerModel: "gemini-2.0-flash",
    coderProvider: "gemini",
    coderModel: "gemini-2.0-flash",
    repairProvider: "anthropic",
    repairModel: "claude-sonnet-4-20250514",
    maxAiCalls: 3,
    maxRepairAttempts: 1,
    stopOnProviderLimit: true,
    askBeforeFallback: true,
    ...patch,
  });
}

describe("feature inventory", () => {
  it("detects auth and localStorage from scan corpus", () => {
    const scan = mockProjectScan(["src/App.tsx"], {
      index: [
        {
          path: "src/App.tsx",
          imports: ["useAuth"],
          exports: [],
          components: ["App"],
          functions: [],
          hooks: ["useAuth"],
          classes: [],
          interfaces: [],
          types: [],
          referencedNames: ["localStorage.setItem", "signIn"],
          symbolLocations: [],
        },
      ],
    });
    const inv = buildFeatureInventoryFromScan(scan, "/project");
    const auth = inv.features.find((f) => f.id === "auth");
    const ls = inv.features.find((f) => f.id === "localstorage");
    assert.equal(auth?.present, true);
    assert.equal(ls?.present, true);
  });
});

describe("feasibility", () => {
  it("flags missing auth and database for cloud save", () => {
    const scan = mockProjectScan(["src/App.tsx"]);
    const inv = buildFeatureInventoryFromScan(scan, "/project");
    const result = analyzeFeasibility("Add cloud save for progress", inv);
    assert.equal(result.requiresConfirmation, true);
    assert.ok(result.missingLabels.includes("Authentication"));
    assert.ok(result.missingLabels.includes("Database"));
  });

  it("passes when required features are present", () => {
    const scan = mockProjectScan(["src/App.tsx"], {
      index: [
        {
          path: "src/App.tsx",
          imports: ["@supabase/supabase-js"],
          exports: [],
          components: [],
          functions: [],
          hooks: [],
          classes: [],
          interfaces: [],
          types: [],
          referencedNames: ["supabase.auth", "createClient"],
          symbolLocations: [],
        },
      ],
      symbols: [],
    });
    const inv = buildFeatureInventoryFromScan(scan, "/project");
    const result = analyzeFeasibility("Add cloud save for progress", inv);
    assert.equal(result.requiresConfirmation, false);
  });
});

describe("complexity routing", () => {
  const settings = baseSettings();

  it("scores larger prompts and file counts higher", () => {
    const low = scoreComplexity({
      prompt: "Fix button padding",
      fileCount: 3,
      featureInventory: null,
      settings,
    });
    const high = scoreComplexity({
      prompt: "Add auth and database cloud save with payments",
      fileCount: 20,
      featureInventory: null,
      settings,
    });
    assert.ok(high > low);
  });

  it("routes auth/database work to Claude when available", () => {
    const decision = resolveComplexityRouting({
      prompt: "Add login and cloud save",
      fileCount: 8,
      featureInventory: null,
      settings,
    });
    assert.equal(decision.tier, "auth_database");
    assert.ok(decision.reason.length > 0);
    assert.ok(decision.score > 0);
  });

  it("routes Sudoku UI layout repair to small_ui despite rebuild wording", () => {
    const prompt = `Audit and repair the generated Sudoku UI.
Fix layout using CSS Grid. If UI audit fails, patch layout, rebuild, and re-preview.`;
    const decision = resolveComplexityRouting({
      prompt,
      fileCount: 12,
      featureInventory: null,
      settings,
    });
    assert.equal(decision.tier, "small_ui");
    assert.ok(decision.score < 40);
  });

  it("routes Sudoku gameplay UX to feature_addition not small_ui", () => {
    const prompt = [
      "Make the Sudoku app easier to play.",
      "Add notes mode, hints, game over modal, and selection behavior.",
    ].join(" ");
    const decision = resolveComplexityRouting({
      prompt,
      fileCount: 2,
      featureInventory: null,
      settings,
    });
    assert.equal(decision.tier, "feature_addition");
  });
});

describe("buildProjectIntelligenceContext", () => {
  it("includes scan, features, and session memory in prompt block", () => {
    const scan = mockProjectScan(["src/App.tsx"]);
    const inv = buildFeatureInventoryFromScan(scan, "/project");
    const session = emptySessionMemory();
    const ctx = buildProjectIntelligenceContext({
      scan,
      sessionMemory: session,
      projectMemory: null,
      agentMemory: null,
      featureInventory: inv,
      health: null,
      followUpChat: [],
      snapshots: [],
      userPrompt: "Improve UI",
    });
    assert.ok(ctx.promptBlock.includes("PROJECT INTELLIGENCE"));
    assert.ok(ctx.promptBlock.includes("Feature inventory"));
    assert.ok(ctx.meta.scanSummary.includes("files"));
  });
});
