import fs from "node:fs";
import type { PatchTargetFile } from "./aiPatch.cjs";
import { normalizeApplyPlanPath } from "./markedFileParse.cjs";

export type HydrateApplyPlanBatchResult =
  | { ok: true; files: PatchTargetFile[] }
  | { ok: false; error: string; missingPaths: string[] };

/** Resolve empty IPC file bodies from absPath so the renderer can send metadata only. */
export function hydrateApplyPlanBatchFiles(
  files: readonly PatchTargetFile[],
): HydrateApplyPlanBatchResult {
  const hydratedFiles: PatchTargetFile[] = [];
  for (const f of files) {
    const rel = normalizeApplyPlanPath(f.path);
    if (f.content && f.content.length > 0) {
      hydratedFiles.push({ path: rel, content: f.content });
      continue;
    }
    if (f.absPath && typeof f.absPath === "string") {
      try {
        const content = fs.readFileSync(f.absPath, "utf8");
        hydratedFiles.push({ path: rel, content });
      } catch (err) {
        return {
          ok: false,
          error: `Failed to read ${rel}: ${err instanceof Error ? err.message : String(err)}`,
          missingPaths: [rel],
        };
      }
      continue;
    }
    // Create targets intentionally have empty content.
    hydratedFiles.push({ path: rel, content: f.content ?? "" });
  }
  return { ok: true, files: hydratedFiles };
}
