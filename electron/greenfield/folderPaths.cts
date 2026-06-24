import * as path from "node:path";
import { promises as fs } from "node:fs";
import { isEmptyDirectory } from "./write.cjs";

export const FOLDER_NOT_EMPTY_CODE = "FOLDER_NOT_EMPTY" as const;

export function folderNotEmptyErrorMessage(): string {
  return "Folder is not empty. Cannot write greenfield files into a non-empty directory.";
}

export async function findNextNumberedSiblingFolder(
  currentFolder: string,
): Promise<string> {
  const resolved = path.resolve(currentFolder);
  const parent = path.dirname(resolved);
  const base = path.basename(resolved);
  const parsed = Number.parseInt(base, 10);
  const start = Number.isFinite(parsed) ? parsed + 1 : 1;

  for (let i = start; i < start + 10_000; i++) {
    const candidate = path.join(parent, String(i));
    try {
      await fs.access(candidate);
      if (await isEmptyDirectory(candidate)) return candidate;
    } catch {
      return candidate;
    }
  }
  throw new Error("Could not find an available numbered folder.");
}

export async function clearDirectoryContents(
  dir: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const resolved = path.resolve(dir);
  try {
    const entries = await fs.readdir(resolved);
    for (const entry of entries) {
      if (entry === ".DS_Store") continue;
      await fs.rm(path.join(resolved, entry), { recursive: true, force: true });
    }
    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Could not clear folder.";
    return { ok: false, error: message };
  }
}
