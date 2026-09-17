import type { StressPromptDefinition } from "../types";

/** Page titles listed under the `Pages:` section of a STRESS_PROMPTS prompt. */
export function parseListedPages(prompt: string): readonly string[] {
  const marker = "Pages:";
  const start = prompt.indexOf(marker);
  if (start < 0) return [];
  const section = prompt.slice(start + marker.length);
  const titles: string[] = [];
  for (const rawLine of section.split("\n")) {
    const line = rawLine.trim();
    if (!line) {
      if (titles.length > 0) break;
      continue;
    }
    if (line.startsWith("Features:")) break;
    const bullet = line.match(/^\*\s+(.+)$/);
    if (bullet) {
      titles.push(bullet[1]!.trim());
    }
  }
  return titles;
}

export function pageComponentName(title: string): string {
  return title
    .replace(/[^A-Za-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.slice(0, 1).toUpperCase() + word.slice(1))
    .join("");
}

export function pageRouteId(title: string): string {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function pagesForPrompt(prompt: StressPromptDefinition): readonly string[] {
  return parseListedPages(prompt.prompt);
}
