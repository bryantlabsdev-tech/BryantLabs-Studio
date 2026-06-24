import { healthToReliabilityStatus } from "@/core/providers/reliability";
import { hasStoredApiKey } from "@/core/providers/AnthropicProvider";
import type { HealthResult, ProviderId, ProviderSettings } from "@/core/providers/types";

export type ProviderKeyTestPhase = "idle" | "loading" | "done" | "error";

export function apiKeySavedIndicator(
  settings: ProviderSettings,
  provider: ProviderId,
): { saved: boolean; label: string } {
  const saved = hasStoredApiKey(settings, provider);
  return saved
    ? { saved: true, label: "✓ API Key Saved" }
    : { saved: false, label: "⚠ API Key Missing" };
}

export function providerConnectionTestLabel(
  provider: ProviderId,
  settings: ProviderSettings,
  health: HealthResult | null,
  phase: ProviderKeyTestPhase,
): string | null {
  if (phase === "loading") return "Testing…";
  if (phase === "error") return "✗ Network Error";
  if (!health) return null;

  if (health.ok) return "✓ Connected";

  const status = healthToReliabilityStatus(health, settings, provider);
  switch (status) {
    case "rate_limited":
      return "⚠ Rate Limited";
    case "invalid_key":
      return "✗ Invalid Key";
    case "insufficient_credits":
      return "✗ No Credits";
    case "offline":
    case "timeout":
      return "✗ Network Error";
    case "missing_key":
      return "⚠ API Key Missing";
    case "model_missing":
      return "✗ Model Unavailable";
    default:
      return "✗ Error";
  }
}

export function providerConnectionTestTone(
  health: HealthResult | null,
  phase: ProviderKeyTestPhase,
): "idle" | "pass" | "warn" | "fail" {
  if (phase === "loading" || phase === "idle") return "idle";
  if (phase === "error") return "fail";
  if (!health) return "idle";
  if (health.ok) return "pass";

  const status = health.connectionStatus;
  if (status === "rate_limited") return "warn";
  if (status === "invalid_key" || status === "offline") return "fail";
  return "fail";
}
