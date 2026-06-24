import { textMentionsAuthenticationInfrastructure } from "@/core/intelligence/authDependency";
import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";
import type { FollowUpChatMessage } from "@/core/build/followUpChat";
import type { AppDomain } from "./types";
import { classifyAppDomain } from "./classify";

export interface ProjectFact {
  readonly id: string;
  readonly label: string;
  readonly present: boolean;
}

interface CapabilityDef {
  readonly id: string;
  readonly label: string;
  readonly domains: readonly AppDomain[] | "all";
  readonly detect: (text: string) => boolean;
}

const CAPABILITIES: readonly CapabilityDef[] = [
  {
    id: "product_comparison",
    label: "Product comparison",
    domains: ["comparison", "marketplace"],
    detect: (t) => /\bcompare|comparison|versus|side.?by.?side|product card\b/.test(t),
  },
  {
    id: "filters",
    label: "Search and filters",
    domains: ["comparison", "marketplace", "crm", "dashboard"],
    detect: (t) => /\bfilter|sort by|search\b/.test(t),
  },
  {
    id: "auth",
    label: "User accounts",
    domains: ["saas", "social", "crm", "marketplace"],
    detect: (t) => textMentionsAuthenticationInfrastructure(t),
  },
  {
    id: "dashboard",
    label: "Dashboard UI",
    domains: ["dashboard", "crm", "saas"],
    detect: (t) => /\bdashboard|kpi|metric|analytics panel\b/.test(t),
  },
  {
    id: "puzzle_board",
    label: "Puzzle board",
    domains: ["game_puzzle"],
    detect: (t) => /\bsudoku|puzzle board|game board|sudoku-board\b/.test(t),
  },
  {
    id: "timer",
    label: "Timer",
    domains: ["game_puzzle", "game_arcade", "productivity", "utility"],
    detect: (t) => /\btimer|countdown|elapsed|stopwatch\b/.test(t),
  },
  {
    id: "difficulty",
    label: "Difficulty selector",
    domains: ["game_puzzle", "game_arcade"],
    detect: (t) => /\bdifficulty|easy|medium|hard\b/.test(t) && /\blevel|difficulty\b/.test(t),
  },
  {
    id: "hint",
    label: "Hint system",
    domains: ["game_puzzle"],
    detect: (t) => /\bhint|clue|reveal\b/.test(t),
  },
  {
    id: "stats",
    label: "Statistics",
    domains: ["game_puzzle", "game_arcade", "dashboard"],
    detect: (t) => /\bstatistic|stats|score|leaderboard|record\b/.test(t),
  },
  {
    id: "theme",
    label: "Theme support",
    domains: "all",
    detect: (t) => /\btheme|dark mode|light mode|premium|styling\b/.test(t),
  },
  {
    id: "mobile",
    label: "Mobile layout",
    domains: "all",
    detect: (t) => /\bmobile|responsive|viewport\b/.test(t),
  },
  {
    id: "localstorage",
    label: "LocalStorage enabled",
    domains: "all",
    detect: (t) => /\blocalstorage|local storage|persist\b/.test(t),
  },
];

function appliesToDomain(cap: CapabilityDef, domain: AppDomain): boolean {
  if (cap.domains === "all") return true;
  return cap.domains.includes(domain);
}

function corpus(
  memory: SessionMemorySnapshot,
  chat: readonly FollowUpChatMessage[],
): string {
  const parts: string[] = [];
  for (const p of memory.prompts) parts.push(p.prompt);
  for (const pl of memory.plans) {
    parts.push(pl.prompt, pl.summary, ...pl.files);
  }
  parts.push(...memory.modifiedFiles);
  for (const m of chat) parts.push(m.text);
  return parts.join("\n").toLowerCase();
}

function isImplemented(
  _id: string,
  detect: (text: string) => boolean,
  memory: SessionMemorySnapshot,
  chat: readonly FollowUpChatMessage[],
  text: string,
  modified: string,
): boolean {
  const mentioned = detect(text);
  if (!mentioned) return false;
  const inFiles = detect(modified);
  return (
    inFiles ||
    memory.plans.some((p) => detect(p.summary) && p.files.length > 0) ||
    chat.some(
      (m) => m.role === "studio" && m.outcome === "success" && detect(m.text),
    )
  );
}

/** Domain-aware project capabilities (replaces game-only FEATURE_PATTERNS). */
export function deriveProjectFacts(
  memory: SessionMemorySnapshot,
  chat: readonly FollowUpChatMessage[],
): ProjectFact[] {
  const text = corpus(memory, chat);
  const modified = memory.modifiedFiles.join("\n").toLowerCase();
  const lastPrompt = memory.prompts[memory.prompts.length - 1]?.prompt ?? "";
  const domain = classifyAppDomain({ prompt: lastPrompt }).domain;

  return CAPABILITIES.filter((cap) => appliesToDomain(cap, domain))
    .map(({ id, label, detect }) => {
      const present = isImplemented(id, detect, memory, chat, text, modified);
      const relevant = present || detect(text);
      return { id, label, present, relevant };
    })
    .filter((f) => f.relevant)
    .map(({ id, label, present }) => ({ id, label, present }));
}
