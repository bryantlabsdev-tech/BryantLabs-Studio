import type { ProviderId } from "@/core/providers/types";

/** Recommended local coding model (shown with ⭐ in the model dropdown). */
export const OLLAMA_RECOMMENDED_CODING_MODEL = "qwen2.5-coder:7b";

export function providerUsesDynamicModels(provider: ProviderId): boolean {
  return provider === "ollama" || provider === "anthropic";
}

/** Parse Ollama `GET /api/tags` model names (exact tag strings). */
export function parseOllamaTagNames(json: unknown): string[] {
  const data = json as { models?: Array<{ name?: string }> };
  const names = (data?.models ?? [])
    .map((m) => m.name?.trim() ?? "")
    .filter((n) => n.length > 0);
  return [...new Set(names)].sort((a, b) => a.localeCompare(b));
}

export function ollamaModelIsInstalled(
  saved: string,
  installed: readonly string[],
): boolean {
  const trimmed = saved.trim();
  if (!trimmed) return false;
  return installed.some(
    (m) => m === trimmed || m.split(":")[0] === trimmed,
  );
}

/** Pick exact tag id after discovery (saved name or legacy base name). */
export function resolveOllamaModelAfterDiscovery(
  saved: string,
  installed: readonly string[],
): string {
  if (installed.length === 0) return saved.trim();

  const trimmed = saved.trim();
  if (trimmed && installed.includes(trimmed)) return trimmed;

  if (trimmed) {
    const legacy = installed.find(
      (m) => m === trimmed || m.split(":")[0] === trimmed,
    );
    if (legacy) return legacy;
  }

  return installed[0]!;
}

export function resolveDiscoveredModel(
  provider: ProviderId,
  saved: string,
  installed: readonly string[],
): string {
  if (provider === "ollama") {
    return resolveOllamaModelAfterDiscovery(saved, installed);
  }
  const trimmed = saved.trim();
  if (trimmed && installed.includes(trimmed)) return trimmed;
  return installed[0] ?? trimmed;
}

export function formatOllamaModelOptionLabel(model: string): string {
  if (model === OLLAMA_RECOMMENDED_CODING_MODEL) {
    return `⭐ ${model}`;
  }
  return model;
}

export function installedModelsLabel(count: number): string {
  return `Installed Models (${count})`;
}
