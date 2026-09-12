import * as path from "node:path";
import { promises as fs } from "node:fs";
import type { IpcMain } from "electron";
import { safeMkdir, safeWriteText } from "./safeFs.cjs";

const SHADOW_DIR = ".bryantlabs/shadow-runs";

function isUnderProjectRoot(projectRoot: string, target: string): boolean {
  const root = path.resolve(projectRoot);
  const abs = path.resolve(target);
  return abs === root || abs.startsWith(`${root}${path.sep}`);
}

function runDir(root: string, runId: string): string {
  const safeId = runId.replace(/[^a-zA-Z0-9._-]/g, "_");
  return path.join(root, SHADOW_DIR, safeId);
}

function validateRelPath(relPath: string): string | null {
  const normalized = relPath.replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || normalized.includes("..")) return null;
  return normalized;
}

export async function stageShadowFiles(
  projectRoot: string,
  runId: string,
  files: readonly { relPath: string; content: string }[],
): Promise<{ ok: boolean; reason?: string; staged?: number }> {
  if (!isUnderProjectRoot(projectRoot, projectRoot)) {
    return { ok: false, reason: "No project open." };
  }
  const base = runDir(projectRoot, runId);
  await fs.rm(base, { recursive: true, force: true }).catch(() => undefined);
  let staged = 0;
  for (const file of files) {
    const rel = validateRelPath(file.relPath);
    if (!rel) return { ok: false, reason: `Invalid shadow path: ${file.relPath}` };
    const abs = path.join(base, rel);
    if (!isUnderProjectRoot(projectRoot, abs)) {
      return { ok: false, reason: `Shadow path outside project: ${file.relPath}` };
    }
    await safeMkdir(path.dirname(abs));
    const written = await safeWriteText(abs, file.content);
    if (!written.ok) return { ok: false, reason: written.reason ?? "Shadow write failed." };
    staged += 1;
  }
  return { ok: true, staged };
}

export async function discardShadowRun(
  projectRoot: string,
  runId: string,
): Promise<{ ok: boolean }> {
  const base = runDir(projectRoot, runId);
  await fs.rm(base, { recursive: true, force: true }).catch(() => undefined);
  return { ok: true };
}

export function registerShadowWorkspaceIpc(
  ipcMain: IpcMain,
  getProjectRoot: () => string | null,
): void {
  ipcMain.handle(
    "shadow:stage",
    async (
      _event,
      runId: unknown,
      files: unknown,
    ): Promise<{ ok: boolean; reason?: string; staged?: number }> => {
      const root = getProjectRoot();
      if (!root) return { ok: false, reason: "No project open." };
      if (typeof runId !== "string" || runId.length < 1) {
        return { ok: false, reason: "Invalid run id." };
      }
      if (!Array.isArray(files)) return { ok: false, reason: "Invalid file list." };
      const parsed: { relPath: string; content: string }[] = [];
      for (const entry of files) {
        if (
          !entry ||
          typeof entry !== "object" ||
          typeof (entry as { relPath?: unknown }).relPath !== "string" ||
          typeof (entry as { content?: unknown }).content !== "string"
        ) {
          return { ok: false, reason: "Invalid staged file entry." };
        }
        parsed.push({
          relPath: (entry as { relPath: string }).relPath,
          content: (entry as { content: string }).content,
        });
      }
      return stageShadowFiles(root, runId, parsed);
    },
  );

  ipcMain.handle(
    "shadow:discard",
    async (_event, runId: unknown): Promise<{ ok: boolean; reason?: string }> => {
      const root = getProjectRoot();
      if (!root) return { ok: false, reason: "No project open." };
      if (typeof runId !== "string" || runId.length < 1) {
        return { ok: false, reason: "Invalid run id." };
      }
      return discardShadowRun(root, runId);
    },
  );
}
