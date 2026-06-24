import { getProviderInfo } from "@/core/providers/registry";
import { modelForProvider } from "@/core/providers/AnthropicProvider";
import { PROVIDER_CONNECTION_LABELS } from "@/core/providers/connectionStatus";
import {
  formatPipelinePillText,
  formatSingleAgentPillText,
  isPipelineMode,
  resolveStageRouting,
  type AgentStage,
} from "@/core/providers/orchestration";
import {
  healthToReliabilityStatus,
  redactProviderSecrets,
  reliabilityStatusLabel,
} from "@/core/providers/reliability";
import type { HealthResult, ProviderSettings, AgentMode, ProviderId } from "@/core/providers/types";

export type ProviderStatusTone = "green" | "yellow" | "red";

/**
 * User-facing provider names.
 * OpenAI and OpenRouter appear here for when they are added to the registry.
 */
export const PROVIDER_DISPLAY_LABELS: Record<ProviderId, string> = {
  gemini: "Gemini",
  ollama: "Ollama",
  anthropic: "Anthropic",
  groq: "Groq",
  openrouter: "OpenRouter",
};

/** Labels for providers planned in the registry (title bar / docs). */
export const FUTURE_PROVIDER_DISPLAY_LABELS = {
  openai: "OpenAI",
} as const;

export interface ProviderStatusSnapshot {
  readonly provider: ProviderId;
  readonly providerLabel: string;
  readonly model: string;
  readonly agentMode: AgentMode;
  readonly tone: ProviderStatusTone;
  readonly statusNote: string;
  readonly pillText: string;
  readonly tooltip: string;
  readonly lastCheckedAt: string | null;
  readonly serverUrl: string | null;
  readonly checking: boolean;
  readonly lastError: string | null;
}

function providerLabel(id: ProviderId): string {
  return PROVIDER_DISPLAY_LABELS[id] ?? getProviderInfo(id).label;
}

function providerShortLabel(id: ProviderId): string {
  return providerLabel(id);
}

function configWarning(
  settings: ProviderSettings,
  provider: ProviderId,
): string | null {
  if (provider === "gemini" && !settings.hasGeminiKey) {
    return "Missing Key";
  }
  if (provider === "anthropic" && !settings.hasAnthropicKey) {
    return "Missing Key";
  }
  if (provider === "groq" && !settings.hasGroqKey) {
    return "Missing Key";
  }
  if (provider === "openrouter" && !settings.hasOpenRouterKey) {
    return "Missing Key";
  }
  if (provider === "ollama") {
    if (!settings.ollamaBaseUrl.trim()) return "Offline";
    if (!settings.ollamaModel.trim()) return "Model missing";
  }
  return null;
}

function toneFromReliability(status: ReturnType<typeof healthToReliabilityStatus>): {
  tone: ProviderStatusTone;
  statusNote: string;
} {
  switch (status) {
    case "online":
      return { tone: "green", statusNote: "Online" };
    case "missing_key":
      return { tone: "yellow", statusNote: "Missing Key" };
    case "invalid_key":
      return { tone: "yellow", statusNote: "Invalid key" };
    case "rate_limited":
      return { tone: "yellow", statusNote: "Rate limited" };
    case "insufficient_credits":
      return { tone: "yellow", statusNote: "Insufficient credits" };
    case "model_missing":
      return { tone: "yellow", statusNote: "Model missing" };
    case "timeout":
      return { tone: "yellow", statusNote: "Timeout" };
    case "offline":
      return { tone: "red", statusNote: "Offline" };
    default:
      return { tone: "red", statusNote: "Error" };
  }
}

function toneFromHealth(
  settings: ProviderSettings,
  provider: ProviderId,
  health: HealthResult | null,
): { tone: ProviderStatusTone; statusNote: string } {
  const config = configWarning(settings, provider);
  if (config) return { tone: "yellow", statusNote: config };

  if (!health) {
    return { tone: "yellow", statusNote: "Not checked" };
  }

  return toneFromReliability(healthToReliabilityStatus(health, settings, provider));
}

function pipelineStageIssue(
  settings: ProviderSettings,
  healthByProvider: Partial<Record<ProviderId, HealthResult>> | undefined,
): { tone: ProviderStatusTone; statusNote: string } | null {
  const stages: Array<{ stage: AgentStage; label: string }> = [
    { stage: "planner", label: "Planner" },
    { stage: "coder", label: "Coder" },
    { stage: "repair", label: "Repair" },
  ];

  for (const { stage, label } of stages) {
    const routing = resolveStageRouting(settings, stage);
    if (!routing) continue;
    const provider = routing.provider;
    const config = configWarning(settings, provider);
    if (config) {
      return {
        tone: "yellow",
        statusNote: `${label} ${providerShortLabel(provider)} ${config.toLowerCase()}`,
      };
    }
    const health = healthByProvider?.[provider] ?? null;
    const reliability = healthToReliabilityStatus(health, settings, provider);
    if (reliability !== "online") {
      const { tone, statusNote } = toneFromReliability(reliability);
      return {
        tone,
        statusNote: `${label} ${providerShortLabel(provider)} ${statusNote.toLowerCase()}`,
      };
    }
  }
  return null;
}

function formatTooltip(opts: {
  settings: ProviderSettings;
  provider: ProviderId;
  model: string;
  health: HealthResult | null;
  lastCheckedAt: string | null;
  statusNote: string;
  healthByProvider?: Partial<Record<ProviderId, HealthResult>>;
}): string {
  const { settings, provider, model, health, lastCheckedAt, statusNote, healthByProvider } =
    opts;
  const lines = [
    `Agent mode: ${isPipelineMode(settings) ? "Multi-Agent Pipeline" : "Single Agent"}`,
  ];
  if (isPipelineMode(settings)) {
    lines.push(`Pipeline: ${formatPipelinePillText(settings)}`);
    lines.push("Verifier: Local");
    for (const stage of ["planner", "coder", "repair"] as const) {
      const routing = resolveStageRouting(settings, stage);
      if (!routing) continue;
      const stageHealth = healthByProvider?.[routing.provider] ?? null;
      const rel = healthToReliabilityStatus(stageHealth, settings, routing.provider);
      lines.push(
        `${stage}: ${providerShortLabel(routing.provider)} · ${routing.model} · ${reliabilityStatusLabel(rel)}`,
      );
    }
  } else {
    lines.push(`Provider: ${providerLabel(provider)}`);
    lines.push(`Model: ${model || "—"}`);
  }
  if (provider === "ollama" || settings.provider === "ollama") {
    lines.push(`Server URL: ${settings.ollamaBaseUrl || "—"}`);
  }
  if (lastCheckedAt) {
    lines.push(`Last health check: ${new Date(lastCheckedAt).toLocaleString()}`);
  } else {
    lines.push("Last health check: —");
  }
  lines.push(`Status: ${statusNote}`);
  if (health?.connectionStatus) {
    lines.push(
      `Connection: ${PROVIDER_CONNECTION_LABELS[health.connectionStatus]}`,
    );
  }
  if (health?.error) {
    lines.push(`Last error: ${redactProviderSecrets(health.error)}`);
  }
  return lines.join("\n");
}

export function buildProviderStatusSnapshot(opts: {
  settings: ProviderSettings;
  health: HealthResult | null;
  healthByProvider?: Partial<Record<ProviderId, HealthResult>>;
  checking?: boolean;
  lastCheckedAt?: string | null;
}): ProviderStatusSnapshot {
  const { settings, health, checking = false, healthByProvider } = opts;
  const provider = settings.provider;
  const providerLabelText = providerLabel(provider);
  const model = modelForProvider(settings, provider).trim();
  const lastCheckedAt = opts.lastCheckedAt ?? null;
  const lastError = health?.error ? redactProviderSecrets(health.error) : null;

  let tone: ProviderStatusTone;
  let statusNote: string;

  if (checking) {
    tone = "yellow";
    statusNote = "Checking…";
  } else if (isPipelineMode(settings)) {
    const issue = pipelineStageIssue(settings, healthByProvider);
    if (issue) {
      tone = issue.tone;
      statusNote = issue.statusNote;
    } else {
      tone = "green";
      statusNote = "Online";
    }
  } else {
    ({ tone, statusNote } = toneFromHealth(settings, provider, health));
  }

  const modePrefix = isPipelineMode(settings) ? "Pipeline" : "Single";
  let pillText: string;

  if (checking) {
    pillText = isPipelineMode(settings)
      ? `${modePrefix} · Checking…`
      : `${modePrefix} · ${providerLabelText} · Checking…`;
  } else if (isPipelineMode(settings)) {
    pillText =
      tone === "green"
        ? `${modePrefix} · ${formatPipelinePillText(settings)}`
        : `${modePrefix} · ${statusNote}`;
  } else if (tone === "green" && model) {
    pillText = `${modePrefix} · ${formatSingleAgentPillText(settings)}`;
  } else if (tone === "green") {
    pillText = `${modePrefix} · ${providerLabelText}`;
  } else {
    pillText = `${modePrefix} · ${providerLabelText} · ${statusNote}`;
  }

  return {
    provider,
    providerLabel: providerLabelText,
    model,
    agentMode: settings.agentMode ?? "single",
    tone,
    statusNote,
    pillText,
    tooltip: formatTooltip({
      settings,
      provider,
      model,
      health: checking ? null : health,
      lastCheckedAt,
      statusNote,
      ...(healthByProvider ? { healthByProvider } : {}),
    }),
    lastCheckedAt,
    serverUrl: provider === "ollama" ? settings.ollamaBaseUrl : null,
    checking,
    lastError,
  };
}
