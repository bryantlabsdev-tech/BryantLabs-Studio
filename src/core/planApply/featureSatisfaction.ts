/** Prompt asks for a persistent stats panel (elapsed time, mistakes, hints, games completed). */
export function isStatsPanelFeaturePrompt(prompt: string): boolean {
  const lower = prompt.toLowerCase();
  if (/\bstats?\s*panel\b/.test(lower)) return true;
  if (/\bstatistics\s*panel\b/.test(lower)) return true;
  return (
    /\belapsed\s*time\b/.test(lower) &&
    /\bmistakes?\b/.test(lower) &&
    /\bhints?\b/.test(lower) &&
    /\bgames?\s*completed\b/.test(lower)
  );
}

/** App.tsx already implements stats tracking + localStorage persistence. */
export function appTsxHasStatsPanelFeature(appTsx: string): boolean {
  if (!appTsx.trim()) return false;
  const lower = appTsx.toLowerCase();
  if (!/localstorage/i.test(lower)) return false;
  if (
    !/\bstats?-?panel\b/.test(lower) &&
    !/statspanel/.test(lower) &&
    !/data-testid=["']stats[-_]?panel/i.test(appTsx) &&
    !/class(?:name)?=["'][^"']*stats-panel/i.test(appTsx)
  ) {
    return false;
  }
  if (!/\bmistakes?\b/.test(lower)) return false;
  if (!/\bhints?\b/.test(lower)) return false;
  const hasElapsed = /\belapsed|formattime|⏱|\btimer\b/i.test(appTsx);
  const hasGamesCompleted = /games?\s*completed|gamescompleted/i.test(lower);
  return hasElapsed && hasGamesCompleted;
}

export interface SatisfiedGameplayFeature {
  readonly relPath: string;
  readonly message: string;
}

/** When the requested gameplay feature is already present, skip expensive patch proposals. */
export function detectSatisfiedGameplayFeature(
  prompt: string,
  sources: Readonly<Record<string, string>>,
): SatisfiedGameplayFeature | null {
  if (!isStatsPanelFeaturePrompt(prompt)) return null;
  const appTsx = sources["src/App.tsx"];
  if (!appTsx || !appTsxHasStatsPanelFeature(appTsx)) return null;
  return {
    relPath: "src/App.tsx",
    message:
      "Stats panel with elapsed time, mistakes, hints used, and games completed is already implemented in App.tsx (localStorage persistence detected).",
  };
}
