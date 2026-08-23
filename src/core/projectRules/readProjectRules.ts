import type { BryantLabsApi } from "@/types";

export const PROJECT_RULES_REL_PATHS = [
  ".bryantlabs/rules.md",
  ".cursorrules",
] as const;

export const MAX_PROJECT_RULES_CHARS = 8_000;

let cache: { readonly root: string; readonly text: string } | null = null;

export function clearProjectRulesCache(): void {
  cache = null;
}

export async function readProjectRulesText(
  api: BryantLabsApi,
  projectRoot: string,
): Promise<string> {
  const root = projectRoot.replace(/[/\\]+$/, "");
  if (cache?.root === root) return cache.text;

  for (const rel of PROJECT_RULES_REL_PATHS) {
    const abs = `${root}/${rel}`;
    try {
      const res = await api.readFile(abs);
      if (res.readable && res.content?.trim()) {
        const text = res.content.trim().slice(0, MAX_PROJECT_RULES_CHARS);
        cache = { root, text };
        return text;
      }
    } catch {
      /* try next path */
    }
  }

  cache = { root, text: "" };
  return "";
}
