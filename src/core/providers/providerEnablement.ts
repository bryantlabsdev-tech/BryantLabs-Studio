import { getProviderInfo, PROVIDERS } from "@/core/providers/registry";
import { healthToReliabilityStatus } from "@/core/providers/reliability";
import { providerApiKeyPresent } from "@/core/providers/providerDiagnostics";
import type { HealthResult, ProviderId, ProviderSettings } from "@/core/providers/types";

/** Priority order when auto-switching away from a disabled provider. */
export const PROVIDER_ENABLEMENT_ORDER: readonly ProviderId[] = [
  "gemini",
  "anthropic",
  "openrouter",
  "groq",
  "ollama",
];

export type ProviderEnabledMap = Record<ProviderId, boolean>;

export type ProviderPanelStatus =
  | "disabled"
  | "enabled"
  | "missing_key"
  | "connected"
  | "error";

export interface ProviderEnablementSwitch {
  readonly field: string;
  readonly from: ProviderId;
  readonly to: ProviderId;
}

export function defaultProviderEnabled(): ProviderEnabledMap {
  return {
    gemini: true,
    anthropic: true,
    openrouter: true,
    groq: true,
    ollama: true,
  };
}

/** Missing / false entries default to enabled for backward compatibility. */
export function normalizeProviderEnabled(
  partial?: Partial<Record<ProviderId, boolean>>,
): ProviderEnabledMap {
  const defaults = defaultProviderEnabled();
  if (!partial) return defaults;
  return {
    gemini: partial.gemini !== false,
    anthropic: partial.anthropic !== false,
    openrouter: partial.openrouter !== false,
    groq: partial.groq !== false,
    ollama: partial.ollama !== false,
  };
}

export function isProviderEnabled(
  settings: Pick<ProviderSettings, "providerEnabled">,
  id: ProviderId,
): boolean {
  return normalizeProviderEnabled(settings.providerEnabled)[id];
}

export function listEnabledProviders(
  settings: Pick<ProviderSettings, "providerEnabled">,
): ProviderId[] {
  return PROVIDER_ENABLEMENT_ORDER.filter((id) => isProviderEnabled(settings, id));
}

export function listDisabledProviders(
  settings: Pick<ProviderSettings, "providerEnabled">,
): ProviderId[] {
  return PROVIDER_ENABLEMENT_ORDER.filter((id) => !isProviderEnabled(settings, id));
}

/** Drop leftover Ollama/OpenRouter model ids after a provider remap. */
export function stageModelCompatibleWithProvider(
  model: string | undefined,
  provider: ProviderId,
): boolean {
  const value = model?.trim() ?? "";
  if (!value) return true;
  if (value.includes("/")) return provider === "openrouter";
  if (/^claude/i.test(value)) return provider === "anthropic";
  if (/^gemini/i.test(value)) return provider === "gemini";
  if (value.includes(":") && !/^claude/i.test(value)) {
    return provider === "ollama" || provider === "groq";
  }
  return true;
}

export function highestPriorityEnabledProvider(
  settings: Pick<ProviderSettings, "providerEnabled">,
  prefer?: ProviderId | null,
): ProviderId | null {
  if (prefer && isProviderEnabled(settings, prefer)) return prefer;
  for (const id of PROVIDER_ENABLEMENT_ORDER) {
    if (isProviderEnabled(settings, id)) return id;
  }
  return null;
}

export function effectiveProviderId(
  settings: Pick<ProviderSettings, "providerEnabled">,
  configured: ProviderId,
): ProviderId {
  if (isProviderEnabled(settings, configured)) return configured;
  return highestPriorityEnabledProvider(settings) ?? configured;
}

export function coerceSettingsToEnabledProviders(
  settings: ProviderSettings,
): { readonly settings: ProviderSettings; readonly switches: readonly ProviderEnablementSwitch[] } {
  const switches: ProviderEnablementSwitch[] = [];
  const enabled = normalizeProviderEnabled(settings.providerEnabled);

  const remap = (current: ProviderId, field: string): ProviderId => {
    if (enabled[current]) return current;
    const replacement = highestPriorityEnabledProvider({ providerEnabled: enabled });
    if (replacement && replacement !== current) {
      switches.push({ field, from: current, to: replacement });
      return replacement;
    }
    return current;
  };

  let backupProvider = settings.backupProvider ?? null;
  if (backupProvider && !enabled[backupProvider]) {
    switches.push({
      field: "backupProvider",
      from: backupProvider,
      to: highestPriorityEnabledProvider({ providerEnabled: enabled }) ?? backupProvider,
    });
    backupProvider = null;
  }

  const provider = remap(settings.provider, "provider");
  const plannerProvider = remap(settings.plannerProvider ?? settings.provider, "plannerProvider");
  const coderProvider = remap(settings.coderProvider ?? settings.provider, "coderProvider");
  const repairProvider = remap(settings.repairProvider ?? settings.provider, "repairProvider");

  return {
    settings: {
      ...settings,
      providerEnabled: enabled,
      provider,
      plannerProvider,
      coderProvider,
      repairProvider,
      backupProvider,
      plannerModel: stageModelCompatibleWithProvider(settings.plannerModel, plannerProvider)
        ? settings.plannerModel
        : "",
      coderModel: stageModelCompatibleWithProvider(settings.coderModel, coderProvider)
        ? settings.coderModel
        : "",
      repairModel: stageModelCompatibleWithProvider(settings.repairModel, repairProvider)
        ? settings.repairModel
        : "",
    },
    switches,
  };
}

export function formatProviderEnablementSwitchNotice(
  switches: readonly ProviderEnablementSwitch[],
): string | null {
  if (switches.length === 0) return null;
  const parts = switches.map((s) => {
    const label = (id: ProviderId) => getProviderInfo(id).label;
    if (s.field === "backupProvider") {
      return `Backup provider ${label(s.from)} was cleared because it is disabled`;
    }
    return `${s.field} switched from ${label(s.from)} to ${label(s.to)}`;
  });
  return `Provider routing updated: ${parts.join("; ")}.`;
}

export function formatProviderEnablementRoutingLog(
  settings: Pick<ProviderSettings, "providerEnabled">,
): string {
  const enabled = listEnabledProviders(settings);
  const disabled = listDisabledProviders(settings);
  const enabledLine =
    enabled.length > 0
      ? enabled.map((id) => `✓ ${getProviderInfo(id).label}`).join(", ")
      : "(none)";
  const disabledLine =
    disabled.length > 0
      ? disabled.map((id) => `✕ ${getProviderInfo(id).label}`).join(", ")
      : "(none)";
  return `Enabled: ${enabledLine} · Disabled: ${disabledLine}`;
}

export function formatProviderEnablementDiagnosticSection(
  settings: Pick<ProviderSettings, "providerEnabled">,
): string[] {
  const enabled = listEnabledProviders(settings);
  const disabled = listDisabledProviders(settings);
  return [
    "Provider enablement:",
    enabled.length
      ? `  Enabled: ${enabled.map((id) => getProviderInfo(id).label).join(", ")}`
      : "  Enabled: (none)",
    disabled.length
      ? `  Disabled: ${disabled.map((id) => getProviderInfo(id).label).join(", ")}`
      : "  Disabled: (none)",
    `  Excluded from routing: ${disabled.length ? disabled.join(", ") : "—"}`,
  ];
}

export function resolveProviderPanelStatus(
  settings: ProviderSettings,
  provider: ProviderId,
  health: HealthResult | null | undefined,
): ProviderPanelStatus {
  if (!isProviderEnabled(settings, provider)) return "disabled";
  if (getProviderInfo(provider).needsApiKey && !providerApiKeyPresent(settings, provider)) {
    return "missing_key";
  }
  if (provider === "ollama") {
    if (!settings.ollamaBaseUrl.trim()) return "missing_key";
    if (!settings.ollamaModel.trim()) return "error";
  }
  if (!health) return "enabled";
  if (health.ok) return "connected";
  const rel = healthToReliabilityStatus(health, settings, provider);
  if (rel === "missing_key") return "missing_key";
  return "error";
}

export function providerPanelStatusLabel(status: ProviderPanelStatus): string {
  switch (status) {
    case "disabled":
      return "Disabled";
    case "enabled":
      return "Enabled";
    case "missing_key":
      return "Missing API Key";
    case "connected":
      return "Connected";
    case "error":
      return "Error";
  }
}

/** Providers shown in dropdowns — enabled only. */
export function selectableProviders(
  settings: Pick<ProviderSettings, "providerEnabled">,
): typeof PROVIDERS {
  return PROVIDERS.filter((p) => isProviderEnabled(settings, p.id));
}

export function countEnabledProviders(
  settings: Pick<ProviderSettings, "providerEnabled">,
): number {
  return listEnabledProviders(settings).length;
}

export function patchProviderEnabled(
  settings: ProviderSettings,
  provider: ProviderId,
  enabled: boolean,
): Partial<ProviderSettings> {
  const map = normalizeProviderEnabled(settings.providerEnabled);
  return {
    providerEnabled: {
      ...map,
      [provider]: enabled,
    },
  };
}

/** Save payload for enablement coercion without exactOptionalPropertyTypes violations. */
export function buildProviderEnablementSavePayload(
  settings: ProviderSettings,
): import("@/core/providers/types").ProviderSettingsInput {
  const payload: import("@/core/providers/types").ProviderSettingsInput = {
    provider: settings.provider,
    plannerProvider: settings.plannerProvider,
    coderProvider: settings.coderProvider,
    repairProvider: settings.repairProvider,
    backupProvider: settings.backupProvider ?? null,
    providerEnabled: normalizeProviderEnabled(settings.providerEnabled),
  };
  return payload;
}
