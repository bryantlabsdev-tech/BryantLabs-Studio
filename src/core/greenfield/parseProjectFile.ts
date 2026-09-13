import { recoverBestMarkerContent } from "@/core/greenfield/parseResponse";
import { stripMarkerArtifactsFromContent } from "@/core/greenfield/markerContentSanitizer";
import { repairTruncatedLines } from "@/core/greenfield/generatedSourceHardening";
import { isAllowedGreenfieldProjectPath } from "@/core/greenfield/projectPaths";
import type { GreenfieldProjectFile } from "@/core/greenfield/types";

function markerStart(path: string): string {
  return `@@FILE:${path}@@`;
}

function markerEnd(path: string): string {
  return `@@END:${path}@@`;
}

export function parseTargetFilesFromResponse(
  rawText: string,
  expectedPaths: readonly string[],
): { files: GreenfieldProjectFile[]; missing: string[] } {
  const files: GreenfieldProjectFile[] = [];
  const missing: string[] = [];

  for (const path of expectedPaths) {
    if (!isAllowedGreenfieldProjectPath(path)) continue;

    const start = markerStart(path);
    const end = markerEnd(path);
    const startIdx = rawText.indexOf(start);
    let content: string | null = null;

    if (startIdx !== -1) {
      const contentStart = startIdx + start.length;
      const endIdx = rawText.indexOf(end, contentStart);
      if (endIdx !== -1) {
        content = rawText.slice(contentStart, endIdx).trim();
      } else {
        content = recoverBestMarkerContent(rawText, path as never);
      }
    }

    if (content?.trim()) {
      content = stripMarkerArtifactsFromContent(content);
      content = repairTruncatedLines(content).content;
    }

    if (content?.trim()) {
      files.push({ path: path as GreenfieldProjectFile["path"], content });
    } else {
      missing.push(path);
    }
  }

  return { files, missing };
}

/** Parse every allowed @@FILE block, including nested directories and public assets. */
export function parseAllowedProjectFilesFromResponse(
  rawText: string,
): GreenfieldProjectFile[] {
  const files: GreenfieldProjectFile[] = [];
  const startToken = "@@FILE:";
  let cursor = 0;
  while (cursor < rawText.length) {
    const startIdx = rawText.indexOf(startToken, cursor);
    if (startIdx === -1) break;
    const pathStart = startIdx + startToken.length;
    const pathEnd = rawText.indexOf("@@", pathStart);
    if (pathEnd === -1) break;
    const relPath = rawText.slice(pathStart, pathEnd).trim();
    const afterMarker = rawText[pathEnd + 2] === "\n" ? pathEnd + 3 : pathEnd + 2;
    const endToken = `@@END:${relPath}@@`;
    const endIdx = rawText.indexOf(endToken, afterMarker);
    if (endIdx === -1) {
      cursor = pathEnd + 2;
      continue;
    }
    cursor = endIdx + endToken.length;
    if (!isAllowedGreenfieldProjectPath(relPath)) continue;
    let content = rawText.slice(afterMarker, endIdx).trim();
    if (!content) continue;
    content = stripMarkerArtifactsFromContent(content);
    content = repairTruncatedLines(content).content;
    if (!content.trim()) continue;
    files.push({ path: relPath as GreenfieldProjectFile["path"], content });
  }
  return files;
}

export function mergeProjectFiles(
  base: readonly GreenfieldProjectFile[],
  incoming: readonly GreenfieldProjectFile[],
): GreenfieldProjectFile[] {
  const map = new Map<string, string>();
  for (const f of base) map.set(f.path, f.content);
  for (const f of incoming) {
    if (f.content.trim()) map.set(f.path, f.content);
  }
  return [...map.entries()].map(([path, content]) => ({
    path: path as GreenfieldProjectFile["path"],
    content,
  }));
}

export function coreFilesFromProject(
  project: readonly GreenfieldProjectFile[],
): { path: import("@/core/greenfield/types").GreenfieldFilePath; content: string }[] {
  const core = new Set<string>([
    "package.json",
    "index.html",
    "src/main.tsx",
    "tsconfig.json",
    "vite.config.ts",
    "src/index.css",
    "src/App.tsx",
  ]);
  return project
    .filter((f) => core.has(f.path))
    .map((f) => ({
      path: f.path as import("@/core/greenfield/types").GreenfieldFilePath,
      content: f.content,
    }));
}
