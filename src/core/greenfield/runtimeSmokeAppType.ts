import { classifyGreenfieldGenerationRoute } from "@/core/greenfield/greenfieldRouter";

export type SmokeAppType =
  | "saas_dashboard_crud"
  | "game_animation_visual"
  | "landing_simple"
  | "utility_tool";

const GAME_SIGNALS = [
  /\bstick\s*figur/i,
  /\banimat(e|ion)/i,
  /\bcanvas\b/i,
  /\bgame\b/i,
  /\bfight(ing|s)?\b/i,
  /\bsprite/i,
  /\bvisual/i,
  /\bdraw(ing)?\b/i,
  /\bphysics\b/i,
  /\bcharacter/i,
  /requestAnimationFrame/,
];

const UTILITY_SIGNALS = [
  /\bcalculator\b/i,
  /\bconverter\b/i,
  /\bcounter\b/i,
  /\btool\b/i,
  /\btimer\b/i,
  /\bclock\b/i,
  /\bunit\s*convert/i,
];

const LANDING_SIGNALS = [
  /\blanding\s*page/i,
  /\bhero\s*section/i,
  /\bmarketing\b/i,
  /\bbrochure\b/i,
  /\bportfolio\b/i,
  /\bsingle\s*page/i,
  /\bone\s*screen/i,
  /\bhello\s*world/i,
  /\bminimal\b/i,
];

const SAAS_SIGNALS = [
  /\bdashboard\b/i,
  /\bpages?\s*:/i,
  /\bmulti-?page/i,
  /\breact router/i,
  /\bsidebar\b/i,
  /\bcrud\b/i,
  /\blocalstorage\b/i,
  /\bsaas\b/i,
  /\bkpi/i,
  /\btable/i,
  /\bsettings\b/i,
  /\bmanage(ment)?\b/i,
  /fleetops|medtrack|legalcase|inventory|schoolops/i,
];

function matchesAny(text: string, patterns: readonly RegExp[]): boolean {
  return patterns.some((re) => re.test(text));
}

function read(files: ReadonlyMap<string, string>, path: string): string {
  return files.get(path.replace(/\\/g, "/")) ?? "";
}

/** Classify generated app shape so runtime smoke runs only relevant checks. */
export function classifySmokeAppType(
  prompt: string | undefined,
  files: ReadonlyMap<string, string>,
): SmokeAppType {
  const promptText = (prompt ?? "").trim();
  const app = read(files, "src/App.tsx");
  const allSource = [...files.entries()]
    .filter(([p]) => p.startsWith("src/") && /\.tsx?$/.test(p))
    .map(([, c]) => c)
    .join("\n");
  const haystack = `${promptText}\n${allSource}`;
  const pageCount = [...files.keys()].filter(
    (p) => p.startsWith("src/pages/") && p.endsWith(".tsx"),
  ).length;
  const hasRouter = /<Routes[\s>]/.test(app) || /<Route[\s>]/.test(app);

  if (matchesAny(haystack, GAME_SIGNALS)) {
    return "game_animation_visual";
  }

  if (matchesAny(haystack, UTILITY_SIGNALS)) {
    return "utility_tool";
  }

  const route = promptText ? classifyGreenfieldGenerationRoute(promptText) : null;
  const saasFromPrompt =
    matchesAny(promptText, SAAS_SIGNALS) || (route?.mode === "multi-phase" && (route.score ?? 0) >= 4);

  if (saasFromPrompt || (hasRouter && pageCount >= 3)) {
    return "saas_dashboard_crud";
  }

  if (matchesAny(haystack, LANDING_SIGNALS) || (!hasRouter && pageCount <= 1)) {
    return "landing_simple";
  }

  if (hasRouter && pageCount >= 2) {
    return "saas_dashboard_crud";
  }

  return "landing_simple";
}

export function smokeAppTypeLabel(type: SmokeAppType): string {
  switch (type) {
    case "saas_dashboard_crud":
      return "SaaS / dashboard / CRUD";
    case "game_animation_visual":
      return "Game / animation / visual";
    case "landing_simple":
      return "Landing / simple app";
    case "utility_tool":
      return "Utility / calculator / tool";
  }
}

export function requiresSaasSmokeChecks(type: SmokeAppType): boolean {
  return type === "saas_dashboard_crud";
}
