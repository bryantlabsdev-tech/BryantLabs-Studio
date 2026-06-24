export interface SearchReplaceResult {
  readonly ok: boolean;
  readonly content?: string;
  readonly error?: string;
}

const BLOCK_RE =
  /<<<< SEARCH\r?\n([\s\S]*?)\r?\n=======\r?\n([\s\S]*?)\r?\n>>>> REPLACE/g;

/** Apply Cursor-style SEARCH/REPLACE blocks to full file content. */
export function applySearchReplaceBlocks(
  source: string,
  patch: string,
): SearchReplaceResult {
  if (!patch.includes("<<<< SEARCH")) {
    return { ok: false, error: "No SEARCH/REPLACE blocks in patch." };
  }

  let content = source;
  let applied = 0;
  const blocks = [...patch.matchAll(BLOCK_RE)];
  if (blocks.length === 0) {
    return { ok: false, error: "Malformed SEARCH/REPLACE blocks." };
  }

  for (const block of blocks) {
    const search = block[1]!;
    const replace = block[2]!;
    const idx = content.indexOf(search);
    if (idx < 0) {
      return {
        ok: false,
        error: `SEARCH block not found in file (${search.slice(0, 40)}…)`,
      };
    }
    content = content.slice(0, idx) + replace + content.slice(idx + search.length);
    applied += 1;
  }

  if (applied === 0) {
    return { ok: false, error: "No SEARCH/REPLACE blocks applied." };
  }

  return { ok: true, content };
}

export function patchUsesSearchReplace(content: string): boolean {
  return content.includes("<<<< SEARCH") && content.includes(">>>> REPLACE");
}
