import { hashPrompt } from "@/core/agent/runContextReset";

const MIN_SIMILARITY_CHARS = 8;
const MIN_OVERLAP_WORDS = 3;

function significantWords(text: string): string[] {
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((w) => w.replace(/[^a-z0-9_-]/g, ""))
    .filter((w) => w.length > 3);
}

/** True when retry prompt likely targets the same greenfield run (hash or semantic overlap). */
export function promptsMatchForGreenfieldRecovery(
  previousPrompt: string,
  currentPrompt: string,
): boolean {
  const prev = previousPrompt.trim();
  const cur = currentPrompt.trim();
  if (!prev || !cur) return false;
  if (hashPrompt(prev) === hashPrompt(cur)) return true;
  if (prev.length < MIN_SIMILARITY_CHARS || cur.length < MIN_SIMILARITY_CHARS) {
    return false;
  }

  const prevLower = prev.toLowerCase();
  const curLower = cur.toLowerCase();
  const prefixLen = Math.min(48, prevLower.length, curLower.length);
  if (prefixLen >= MIN_SIMILARITY_CHARS) {
    if (
      prevLower.startsWith(curLower.slice(0, prefixLen)) ||
      curLower.startsWith(prevLower.slice(0, prefixLen))
    ) {
      return true;
    }
  }

  const prevWords = new Set(significantWords(prev));
  const curWords = significantWords(cur);
  if (curWords.length === 0) return false;
  const overlap = curWords.filter((w) => prevWords.has(w)).length;
  const threshold = Math.min(MIN_OVERLAP_WORDS, Math.ceil(curWords.length * 0.45));
  return overlap >= threshold;
}
