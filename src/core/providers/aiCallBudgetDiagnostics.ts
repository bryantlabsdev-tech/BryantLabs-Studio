import type { AiCallTracker } from "@/core/providers/costControls";
import type { ProviderSettings } from "@/core/providers/types";

export interface AiCallBudgetDiagnostics {
  readonly maxCalls: number;
  readonly usedCalls: number;
  readonly remainingCalls: number;
  readonly budgetRequired: number;
  readonly budgetExceeded: boolean;
  readonly budgetExceededReason: string | null;
  readonly runCancellationReason: string | null;
}

export function readAiCallBudgetDiagnostics(
  tracker: AiCallTracker,
  settings: ProviderSettings,
  callsRequired = 1,
  opts?: { readonly afterSuccessfulCall?: boolean },
): AiCallBudgetDiagnostics {
  const budget = tracker.budget(settings);
  const gate = tracker.canMakeCall(settings);
  const budgetExceeded = opts?.afterSuccessfulCall
    ? budget.usedCalls > budget.maxCalls
    : !gate.ok || budget.remainingCalls < callsRequired;
  const budgetExceededReason =
    opts?.afterSuccessfulCall && budget.usedCalls <= budget.maxCalls
      ? null
      : gate.ok
        ? null
        : gate.reason;
  return {
    maxCalls: budget.maxCalls,
    usedCalls: budget.usedCalls,
    remainingCalls: budget.remainingCalls,
    budgetRequired: callsRequired,
    budgetExceeded,
    budgetExceededReason,
    runCancellationReason: null,
  };
}

export function formatAiCallBudgetDiagnostics(
  diagnostics: AiCallBudgetDiagnostics,
): string {
  const lines = [
    `budgetMax: ${diagnostics.maxCalls}`,
    `budgetUsed: ${diagnostics.usedCalls}`,
    `budgetRemaining: ${diagnostics.remainingCalls}`,
    `budgetRequired: ${diagnostics.budgetRequired}`,
    `budgetExceeded: ${diagnostics.budgetExceeded}`,
    `budgetExceededReason: ${diagnostics.budgetExceededReason ?? "—"}`,
    `runCancellationReason: ${diagnostics.runCancellationReason ?? "—"}`,
  ];
  return lines.join("\n");
}

export function parseAiCallBudgetFromLogDetails(
  details: string,
): Partial<AiCallBudgetDiagnostics> | null {
  const values = new Map<string, string>();
  for (const line of details.split("\n")) {
    const idx = line.indexOf(": ");
    if (idx < 0) continue;
    values.set(line.slice(0, idx).trim(), line.slice(idx + 2).trim());
  }
  if (!values.has("budgetMax") && !values.has("budgetRemaining")) return null;
  const readNum = (key: string): number | null => {
    const raw = values.get(key);
    if (!raw || raw === "—") return null;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : null;
  };
  return {
    maxCalls: readNum("budgetMax") ?? 0,
    usedCalls: readNum("budgetUsed") ?? 0,
    remainingCalls: readNum("budgetRemaining") ?? 0,
    budgetRequired: readNum("budgetRequired") ?? 1,
    budgetExceeded: values.get("budgetExceeded") === "true",
    budgetExceededReason:
      values.get("budgetExceededReason") === "—"
        ? null
        : values.get("budgetExceededReason") ?? null,
    runCancellationReason:
      values.get("runCancellationReason") === "—"
        ? null
        : values.get("runCancellationReason") ?? null,
  };
}

export function formatApplyPatchBudgetFailureMessage(
  diagnostics: AiCallBudgetDiagnostics,
): string {
  if (diagnostics.budgetExceededReason) {
    return diagnostics.budgetExceededReason;
  }
  if (diagnostics.runCancellationReason) {
    return diagnostics.runCancellationReason;
  }
  if (diagnostics.budgetExceeded) {
    return `Max AI calls reached (${diagnostics.maxCalls} per run). Planner consumed ${diagnostics.usedCalls} call(s); patch generation needs ${diagnostics.budgetRequired} more.`;
  }
  return "Provider patch generation returned no result.";
}
