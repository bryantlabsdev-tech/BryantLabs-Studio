import * as path from "node:path";

const approvedRoots = new Set<string>();

export function normalizeWorkspaceRoot(root: string): string {
  return path.resolve(root.trim());
}

export function approveWorkspaceRoot(root: string): string {
  const resolved = normalizeWorkspaceRoot(root);
  approvedRoots.add(resolved);
  return resolved;
}

export function isApprovedWorkspaceRoot(
  root: string,
  projectRoot?: string | null,
): boolean {
  const resolved = normalizeWorkspaceRoot(root);
  if (approvedRoots.has(resolved)) return true;
  if (projectRoot) {
    const current = path.resolve(projectRoot);
    if (resolved === current) return true;
  }
  return false;
}

export function resetApprovedWorkspaceRootsForTests(): void {
  approvedRoots.clear();
}
