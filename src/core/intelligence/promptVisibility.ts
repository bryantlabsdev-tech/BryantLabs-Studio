const STORAGE_KEY = "bryantlabs.promptVisibility.v1";
const MAX_ENTRIES = 30;

import type { PromptVisibilityEntry } from "./types";

interface StoredPromptVisibility {
  readonly version: 1;
  readonly entries: PromptVisibilityEntry[];
}

function readRaw(): StoredPromptVisibility {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, entries: [] };
    const data = JSON.parse(raw) as StoredPromptVisibility;
    if (data.version !== 1 || !Array.isArray(data.entries)) {
      return { version: 1, entries: [] };
    }
    return data;
  } catch {
    return { version: 1, entries: [] };
  }
}

function writeRaw(entries: PromptVisibilityEntry[]): void {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ version: 1, entries: entries.slice(0, MAX_ENTRIES) }),
  );
}

const KEY_PATTERNS = [
  /sk-[a-zA-Z0-9_-]{10,}/g,
  /sk-ant-[a-zA-Z0-9_-]+/g,
  /gsk_[a-zA-Z0-9]+/g,
  /Bearer\s+[a-zA-Z0-9._-]+/gi,
];

export function redactPromptSecrets(text: string): string {
  let out = text;
  for (const re of KEY_PATTERNS) {
    out = out.replace(re, "[REDACTED_KEY]");
  }
  return out;
}

export function recordPromptVisibility(entry: Omit<PromptVisibilityEntry, "at">): void {
  const all = readRaw().entries;
  const next: PromptVisibilityEntry = {
    ...entry,
    at: Date.now(),
    prompt: redactPromptSecrets(entry.prompt),
  };
  writeRaw([next, ...all].slice(0, MAX_ENTRIES));
}

export function loadPromptVisibility(
  _projectPath: string | null,
): PromptVisibilityEntry[] {
  return readRaw().entries;
}

export function latestPromptsByStage(): {
  planner: PromptVisibilityEntry | null;
  coder: PromptVisibilityEntry | null;
  repair: PromptVisibilityEntry | null;
} {
  const entries = readRaw().entries;
  return {
    planner: entries.find((e) => e.stage === "planner") ?? null,
    coder: entries.find((e) => e.stage === "coder") ?? null,
    repair: entries.find((e) => e.stage === "repair") ?? null,
  };
}
