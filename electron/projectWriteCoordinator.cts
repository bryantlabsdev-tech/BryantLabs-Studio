import * as path from "node:path";

/** Tracks the active project and a generation counter bumped on every switch. */
let activeRoot: string | null = null;
let generation = 0;

export function noteActiveProject(root: string | null): number {
  const resolved = root && typeof root === "string" && root.length > 0
    ? path.resolve(root)
    : null;
  if (resolved !== activeRoot) {
    activeRoot = resolved;
    generation += 1;
  }
  return generation;
}

export function getActiveProjectRoot(): string | null {
  return activeRoot;
}

export function getProjectGeneration(): number {
  return generation;
}

/** Capture a write token at the start of async work for `root`. */
export function captureProjectWriteToken(root: string): number {
  if (typeof root !== "string" || root.length === 0) return -1;
  if (activeRoot !== path.resolve(root)) return -1;
  return generation;
}

export function isWriteTokenCurrent(root: string, token: number): boolean {
  if (token < 0) return false;
  if (typeof root !== "string" || root.length === 0) return false;
  return activeRoot === path.resolve(root) && generation === token;
}

export function isActiveProjectRoot(root: string): boolean {
  if (typeof root !== "string" || root.length === 0) return false;
  return activeRoot === path.resolve(root);
}
