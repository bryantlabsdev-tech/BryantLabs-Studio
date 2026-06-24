import type { ProjectScan } from "../projectScanner.cjs";
import { buildChunksForPaths } from "./incrementalSemantic.cjs";

export interface SemanticChunkRecord {
  id: string;
  path: string;
  startLine: number;
  endLine: number;
  text: string;
  symbolName: string | null;
}

/**
 * Build searchable chunks from scan symbols; fall back to whole-file slices.
 */
export async function buildChunksFromScan(
  scan: ProjectScan,
  readText: (absPath: string) => Promise<string | null>,
): Promise<SemanticChunkRecord[]> {
  return buildChunksForPaths(
    scan,
    scan.files.map((f) => f.path),
    readText,
    0,
  );
}
