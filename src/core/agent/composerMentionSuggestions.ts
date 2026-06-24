import { buildRepositoryIndex } from "@/core/repository/buildIndex";
import { searchRepository } from "@/core/repository/search";
import { CODEBASE_MENTION } from "@/core/agent/codebaseMention";
import type { ProjectScan } from "@/types";

export type MentionSuggestionKind = "file" | "symbol" | "codebase";

export interface MentionSuggestion {
  readonly kind: MentionSuggestionKind;
  readonly label: string;
  readonly insertText: string;
  readonly detail: string;
  readonly score: number;
}

const DEFAULT_FILE_HINTS = ["src/App.tsx", "src/main.tsx", "src/index.css"];
const MAX_SUGGESTIONS = 10;

export function detectActiveMention(
  text: string,
  cursor: number,
): { readonly query: string; readonly start: number } | null {
  const before = text.slice(0, cursor);
  const match = before.match(/@([A-Za-z0-9_./-]*)$/);
  if (!match || match.index === undefined) return null;
  return {
    query: match[1] ?? "",
    start: match.index,
  };
}

export function insertMentionAt(
  text: string,
  cursor: number,
  mentionStart: number,
  insertText: string,
): { readonly nextText: string; readonly nextCursor: number } {
  const token = `@${insertText}`;
  const nextText = `${text.slice(0, mentionStart)}${token} ${text.slice(cursor)}`;
  return { nextText, nextCursor: mentionStart + token.length + 1 };
}

function pushUnique(
  out: MentionSuggestion[],
  seen: Set<string>,
  suggestion: MentionSuggestion,
): void {
  const key = `${suggestion.kind}:${suggestion.insertText}`;
  if (seen.has(key)) return;
  seen.add(key);
  out.push(suggestion);
}

/** Ranked @-mention suggestions from project scan (files + symbols). */
export function buildMentionSuggestions(
  scan: ProjectScan,
  query: string,
  limit = MAX_SUGGESTIONS,
): readonly MentionSuggestion[] {
  const q = query.trim().toLowerCase();
  const out: MentionSuggestion[] = [];
  const seen = new Set<string>();

  if (
    q.length === 0 ||
    CODEBASE_MENTION.startsWith(q) ||
    q === "code" ||
    q === "cod"
  ) {
    pushUnique(out, seen, {
      kind: "codebase",
      label: CODEBASE_MENTION,
      insertText: CODEBASE_MENTION,
      detail: "Search project by relevance + semantic index",
      score: 120,
    });
  }

  if (q.length > 0 && q !== CODEBASE_MENTION) {
    const repo = buildRepositoryIndex(scan);
    for (const hit of searchRepository(repo, q).slice(0, limit)) {
      if (hit.symbolName) {
        pushUnique(out, seen, {
          kind: "symbol",
          label: hit.symbolName,
          insertText: hit.symbolName,
          detail: `${hit.reason} · ${hit.path}`,
          score: hit.score,
        });
      } else {
        pushUnique(out, seen, {
          kind: "file",
          label: hit.path,
          insertText: hit.path,
          detail: hit.reason,
          score: hit.score,
        });
      }
    }
    return out.sort((a, b) => b.score - a.score).slice(0, limit);
  }

  for (const path of DEFAULT_FILE_HINTS) {
    if (!scan.files.some((file) => file.path === path)) continue;
    pushUnique(out, seen, {
      kind: "file",
      label: path,
      insertText: path,
      detail: "File",
      score: 90,
    });
  }

  const symbolNames = new Set<string>();
  for (const sym of scan.symbols) {
    if (!sym.path.startsWith("src/")) continue;
    if (symbolNames.has(sym.name)) continue;
    symbolNames.add(sym.name);
    pushUnique(out, seen, {
      kind: "symbol",
      label: sym.name,
      insertText: sym.name,
      detail: `${sym.kind} · ${sym.path}`,
      score: sym.kind === "component" ? 85 : 70,
    });
    if (out.length >= limit) break;
  }

  for (const file of scan.files) {
    if (!file.path.startsWith("src/")) continue;
    if (out.length >= limit) break;
    pushUnique(out, seen, {
      kind: "file",
      label: file.path,
      insertText: file.path,
      detail: "File",
      score: 40,
    });
  }

  return out
    .sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))
    .slice(0, limit);
}
