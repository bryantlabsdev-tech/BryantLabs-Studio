import type {
  FeasibilityRequirement,
  FeasibilityResult,
  FeasibilityRuleTrace,
  FeatureInventorySnapshot,
} from "./types";
import {
  matchAuthenticationDependency,
  matchCloudSaveDependency,
  matchLocalPersistenceDependency,
  matchPaymentDependency,
} from "./authDependency";

interface FeasibilityRule {
  readonly id: string;
  readonly match: (prompt: string) => {
    readonly matched: boolean;
    readonly pattern: string | null;
    readonly ruleId: string | null;
  };
  readonly requires: readonly { id: string; label: string }[];
}

const RULES: readonly FeasibilityRule[] = [
  {
    id: "cloud_save",
    match: (prompt) => {
      const m = matchCloudSaveDependency(prompt);
      return {
        matched: m.required,
        pattern: m.pattern,
        ruleId: m.ruleId,
      };
    },
    requires: [
      { id: "auth", label: "Authentication" },
      { id: "database", label: "Database" },
    ],
  },
  {
    id: "authentication",
    match: (prompt) => {
      const m = matchAuthenticationDependency(prompt);
      return {
        matched: m.required,
        pattern: m.pattern,
        ruleId: m.ruleId,
      };
    },
    requires: [{ id: "auth", label: "Authentication" }],
  },
  {
    id: "payments",
    match: (prompt) => {
      const m = matchPaymentDependency(prompt);
      return {
        matched: m.required,
        pattern: m.pattern,
        ruleId: m.ruleId,
      };
    },
    requires: [
      { id: "payments", label: "Payments" },
      { id: "auth", label: "Authentication" },
    ],
  },
  {
    id: "multiplayer",
    match: (prompt) => ({
      matched: /\bmultiplayer\b|\brealtime\b|\blive\s*game\b|\bsocket\b/i.test(prompt),
      pattern: "multiplayer|realtime|live game|socket",
      ruleId: "multiplayer",
    }),
    requires: [
      { id: "multiplayer", label: "Multiplayer / realtime" },
      { id: "apis", label: "API integration" },
    ],
  },
  {
    id: "local_persistence",
    match: (prompt) => {
      const m = matchLocalPersistenceDependency(prompt);
      return {
        matched: m.required,
        pattern: m.pattern,
        ruleId: m.ruleId,
      };
    },
    requires: [{ id: "localstorage", label: "LocalStorage persistence" }],
  },
];

function featureSatisfied(
  inventory: FeatureInventorySnapshot | null,
  id: string,
): boolean {
  return inventory?.features.some((f) => f.id === id && f.present) ?? false;
}

function logFeasibilityTraces(
  prompt: string,
  traces: readonly FeasibilityRuleTrace[],
): void {
  if (traces.length === 0) return;
  for (const trace of traces) {
    const addsAuth = trace.addsLabels.includes("Authentication");
    console.info(
      `[feasibility] rule=${trace.ruleId} matcher=${trace.matchedRuleId ?? "—"} pattern=${trace.matchedPattern ?? "—"} adds=[${trace.addsLabels.join(", ")}]${addsAuth ? " → Authentication flagged" : ""}`,
    );
  }
  console.info(`[feasibility] prompt="${prompt.slice(0, 120)}${prompt.length > 120 ? "…" : ""}"`);
}

export function analyzeFeasibility(
  prompt: string,
  inventory: FeatureInventorySnapshot | null,
): FeasibilityResult {
  const trimmed = prompt.trim();
  const traces: FeasibilityRuleTrace[] = [];
  const reqMap = new Map<string, FeasibilityRequirement>();

  for (const rule of RULES) {
    const hit = rule.match(trimmed);
    if (!hit.matched) continue;

    traces.push({
      ruleId: rule.id,
      matchedPattern: hit.pattern,
      matchedRuleId: hit.ruleId,
      addsLabels: rule.requires.map((r) => r.label),
    });

    for (const req of rule.requires) {
      reqMap.set(req.id, {
        id: req.id,
        label: req.label,
        satisfied: featureSatisfied(inventory, req.id),
      });
    }
  }

  logFeasibilityTraces(trimmed, traces);

  const requirements = [...reqMap.values()];
  const missingLabels = requirements.filter((r) => !r.satisfied).map((r) => r.label);
  const requiresConfirmation = missingLabels.length > 0;

  if (!requiresConfirmation) {
    return {
      prompt: trimmed,
      requiresConfirmation: false,
      requirements,
      missingLabels: [],
      headline: "Request looks feasible with current project capabilities.",
      detail: "",
      traces,
    };
  }

  return {
    prompt: trimmed,
    requiresConfirmation: true,
    requirements,
    missingLabels,
    headline: "Dependencies required before this change is fully supported.",
    detail: `Missing: ${missingLabels.join(", ")}. Studio can still plan scaffolding, but you may need to add infrastructure first.`,
    traces,
  };
}
