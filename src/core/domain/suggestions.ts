import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";
import type { FollowUpChatMessage } from "@/core/build/followUpChat";
import type { ProjectFact } from "./capabilities";
import { classifyAppDomain } from "./classify";
import type { AppDomain, AppDomainProfile } from "./types";

interface DomainSuggestion {
  readonly capabilityId?: string;
  readonly text: string;
  readonly domains: readonly AppDomain[] | "all";
}

const DOMAIN_SUGGESTIONS: readonly DomainSuggestion[] = [
  { capabilityId: "product_comparison", text: "Add product comparison rows", domains: ["comparison"] },
  { capabilityId: "filters", text: "Add search and filters", domains: ["comparison", "marketplace", "crm"] },
  { text: "Add sort by price or rating", domains: ["comparison", "marketplace"] },
  { text: "Add a detail view for each item", domains: ["comparison", "marketplace", "crm"] },
  { capabilityId: "dashboard", text: "Add a dashboard summary", domains: ["dashboard", "crm", "saas"] },
  { capabilityId: "auth", text: "Add user accounts", domains: ["saas", "social", "crm", "marketplace"] },
  { capabilityId: "puzzle_board", text: "Improve the puzzle board layout", domains: ["game_puzzle"] },
  { capabilityId: "hint", text: "Add hints", domains: ["game_puzzle"] },
  { capabilityId: "timer", text: "Add a timer", domains: ["game_puzzle", "game_arcade", "productivity"] },
  { capabilityId: "difficulty", text: "Add difficulty levels", domains: ["game_puzzle", "game_arcade"] },
  { capabilityId: "stats", text: "Add statistics", domains: ["game_puzzle", "game_arcade", "dashboard"] },
  { capabilityId: "theme", text: "Add themes", domains: "all" },
  { capabilityId: "mobile", text: "Improve mobile layout", domains: "all" },
];

const GENERIC_EXTRAS = [
  "Make the UI more premium",
  "Add keyboard shortcuts",
  "Polish spacing and typography",
] as const;

const COMPOSER_EXAMPLES: Record<AppDomain | "default", readonly string[]> = {
  saas: ["Add user onboarding", "Improve the settings page", "Add dark mode"],
  dashboard: ["Add a KPI summary", "Improve chart layout", "Add date filters"],
  crm: ["Add client search", "Improve the pipeline view", "Add contact notes"],
  marketplace: ["Add product filters", "Improve the cart flow", "Add product images"],
  comparison: ["Add sort by price", "Add product ratings", "Improve mobile layout"],
  social: ["Add a post feed", "Improve the profile page", "Add notifications"],
  productivity: ["Add task categories", "Add due dates", "Improve mobile layout"],
  utility: ["Improve button layout", "Add keyboard input", "Polish the display"],
  game_puzzle: ["Add hints", "Add difficulty levels", "Improve mobile layout"],
  game_arcade: ["Add a score counter", "Add difficulty levels", "Improve controls"],
  unknown: ["Improve mobile layout", "Add dark mode", "Polish the UI"],
  default: ["Improve mobile layout", "Add dark mode", "Polish the UI"],
};

function appliesSuggestion(s: DomainSuggestion, domain: AppDomain): boolean {
  return s.domains === "all" || s.domains.includes(domain);
}

function missingCapabilityIds(
  facts: readonly ProjectFact[],
  domain: AppDomain,
): Set<string> {
  if (facts.length === 0) {
    return new Set(
      DOMAIN_SUGGESTIONS.filter(
        (s) => s.capabilityId && appliesSuggestion(s, domain),
      ).map((s) => s.capabilityId!),
    );
  }
  return new Set(facts.filter((f) => !f.present).map((f) => f.id));
}

export interface SuggestionRequest {
  readonly prompt: string;
  readonly facts?: readonly ProjectFact[];
  readonly runOutcome?: "created" | "edited" | "repaired" | "audited";
}

/** Domain-aware follow-up suggestions (replaces hardcoded game chips). */
export function suggestNextSteps(req: SuggestionRequest): string[] {
  const profile = classifyAppDomain({ prompt: req.prompt });
  const facts = req.facts ?? [];
  const missing = missingCapabilityIds(facts, profile.domain);

  const fromCatalog = DOMAIN_SUGGESTIONS.filter(
    (s) =>
      appliesSuggestion(s, profile.domain) &&
      (!s.capabilityId || missing.has(s.capabilityId)),
  ).map((s) => s.text);

  const unique = [...new Set(fromCatalog)];
  if (unique.length >= 3) return unique.slice(0, 4);

  const extras = GENERIC_EXTRAS.filter((s) => !unique.includes(s));
  return [...unique, ...extras].slice(0, 4);
}

export function suggestNextImprovements(
  memory: SessionMemorySnapshot,
  chat: readonly FollowUpChatMessage[],
  facts: readonly ProjectFact[],
): string[] {
  const lastPrompt =
    memory.prompts[memory.prompts.length - 1]?.prompt ??
    chat.filter((m) => m.role === "user").at(-1)?.text ??
    "";
  return suggestNextSteps({ prompt: lastPrompt, facts, runOutcome: "edited" });
}

export function suggestComposerExamples(profile?: AppDomainProfile): readonly string[] {
  const domain = profile?.domain ?? "default";
  return COMPOSER_EXAMPLES[domain] ?? COMPOSER_EXAMPLES.default;
}

export function postCreatePlaceholderText(profile: AppDomainProfile): string {
  return `${profile.displayName} is ready — describe your next change…`;
}

export function displayNameFromPrompt(prompt: string): string {
  return classifyAppDomain({ prompt }).displayName;
}
