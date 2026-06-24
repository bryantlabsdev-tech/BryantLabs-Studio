import type { ProjectScan } from "@/types";

function basename(p: string): string {
  const normalized = p.replace(/^\.\//, "").replace(/\\/g, "/");
  const parts = normalized.split("/");
  return parts[parts.length - 1] ?? normalized;
}

/** Map a plan file path to an indexed project file. */
export function resolvePlanFilePath(
  planPath: string,
  scan: ProjectScan,
): { relPath: string; absPath: string } | null {
  const normalized = planPath.replace(/^\.\//, "").replace(/\\/g, "/");
  const hit =
    scan.files.find((f) => f.path === normalized) ??
    scan.files.find((f) => basename(f.path) === basename(normalized));
  if (!hit) return null;
  return { relPath: hit.path, absPath: hit.absPath };
}
