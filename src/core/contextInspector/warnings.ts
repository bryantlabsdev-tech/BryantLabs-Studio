import type {
  ContextMemorySection,
  ContextSnapshot,
  ContextSymbolSection,
  ContextTokenMetrics,
  ContextWarning,
} from "@/core/contextInspector/types";

export function buildContextWarnings(opts: {
  hasScan: boolean;
  memory: ContextMemorySection;
  symbols: ContextSymbolSection;
  metrics: ContextTokenMetrics;
  relevantFileCount: number;
}): ContextWarning[] {
  const warnings: ContextWarning[] = [];

  if (!opts.hasScan) {
    warnings.push({
      level: "warn",
      message: "No repository scan — context may be incomplete.",
    });
  }
  if (!opts.memory.hasContent) {
    warnings.push({
      level: "warn",
      message: "No project memory found.",
    });
  }
  if (!opts.symbols.intelligenceSummary.trim()) {
    warnings.push({
      level: "warn",
      message: "No symbol intelligence summary available.",
    });
  }
  if (opts.relevantFileCount === 0) {
    warnings.push({
      level: "warn",
      message: "No relevant files ranked for this prompt.",
    });
  }
  if (opts.metrics.contextWindowUsagePercent >= 80) {
    warnings.push({
      level: "warn",
      message: `Context exceeds ${opts.metrics.contextWindowUsagePercent}% of model window.`,
    });
  }
  if (opts.metrics.contextWindowUsagePercent >= 95) {
    warnings.push({
      level: "error",
      message: "Context is near or over the model context limit.",
    });
  }
  if (opts.metrics.estimatedTotalTokens > 100_000) {
    warnings.push({
      level: "info",
      message: "Large context payload — provider may truncate or slow down.",
    });
  }

  return warnings;
}

export function warningIcon(level: ContextWarning["level"]): string {
  switch (level) {
    case "error":
      return "⛔";
    case "warn":
      return "⚠";
    default:
      return "ℹ";
  }
}

export function formatMetricsLine(metrics: ContextSnapshot["metrics"]): string {
  return [
    `Prompt Tokens: ${metrics.promptTokens.toLocaleString()}`,
    `Context Tokens: ${metrics.contextTokens.toLocaleString()}`,
    `Estimated Output: ${metrics.estimatedOutputTokens.toLocaleString()}`,
    `Estimated Total: ${metrics.estimatedTotalTokens.toLocaleString()}`,
    `Window: ${metrics.contextWindowTokens.toLocaleString()} (${metrics.contextWindowUsagePercent}%)`,
  ].join("\n");
}
