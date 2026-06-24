import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import {
  normalizeOutcomeToken,
  outcomeLabel,
  type RunOutcome,
} from "@/core/agent/runOutcome";

export interface AgentRunSearchMatch {
  readonly run: AgentRunArtifact;
  readonly matchedOn: "prompt" | "file" | "outcome";
}

export interface AgentRunSearchQuery {
  readonly text: string;
  readonly outcome: RunOutcome | null;
}

export function parseAgentRunSearchQuery(query: string): AgentRunSearchQuery {
  const trimmed = query.trim();
  const prefixMatch = /^outcome:([a-z_]+)\s*(.*)$/i.exec(trimmed);
  if (prefixMatch) {
    return {
      outcome: normalizeOutcomeToken(prefixMatch[1] ?? ""),
      text: prefixMatch[2]?.trim() ?? "",
    };
  }
  return { text: trimmed, outcome: null };
}

function matchesOutcomeFilter(
  run: AgentRunArtifact,
  outcome: RunOutcome | null,
  text: string,
): boolean {
  if (outcome && run.outcome !== outcome) return false;
  if (!text) return outcome != null;
  const normalized = text.toLowerCase();
  if (run.prompt.toLowerCase().includes(normalized)) return true;
  if (run.filesModified.some((file) => file.toLowerCase().includes(normalized))) return true;
  if (outcomeLabel(run.outcome).toLowerCase().includes(normalized)) return true;
  if (run.outcome.includes(normalized)) return true;
  return false;
}

export function searchAgentRuns(
  history: readonly AgentRunArtifact[],
  query: string,
  filterOutcome: RunOutcome | null = null,
): AgentRunSearchMatch[] {
  const parsed = parseAgentRunSearchQuery(query);
  const outcome = filterOutcome ?? parsed.outcome;
  const text = parsed.text;

  if (!text && !outcome) return [];

  const matches: AgentRunSearchMatch[] = [];
  for (const run of history) {
    if (!matchesOutcomeFilter(run, outcome, text)) continue;

    if (outcome && !text) {
      matches.push({ run, matchedOn: "outcome" });
      continue;
    }

    if (text && run.prompt.toLowerCase().includes(text.toLowerCase())) {
      matches.push({ run, matchedOn: "prompt" });
      continue;
    }
    if (text && run.filesModified.some((file) => file.toLowerCase().includes(text.toLowerCase()))) {
      matches.push({ run, matchedOn: "file" });
      continue;
    }
    if (outcome) {
      matches.push({ run, matchedOn: "outcome" });
    }
  }

  return matches.sort((a, b) => b.run.runNumber - a.run.runNumber);
}
