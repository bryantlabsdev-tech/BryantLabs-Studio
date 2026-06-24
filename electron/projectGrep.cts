import type { IpcMain } from "electron";
import { spawn } from "node:child_process";
import * as path from "node:path";

export interface ProjectGrepHit {
  readonly path: string;
  readonly line: number;
  readonly text: string;
}

function parseRgLine(
  root: string,
  line: string,
): ProjectGrepHit | null {
  try {
    const parsed = JSON.parse(line) as {
      type?: string;
      data?: { path?: { text?: string }; line_number?: number; lines?: { text?: string } };
    };
    if (parsed.type !== "match" || !parsed.data?.path?.text) return null;
    const abs = path.resolve(parsed.data.path.text);
    const rel = path.relative(root, abs).replace(/\\/g, "/");
    if (rel.startsWith("..")) return null;
    return {
      path: rel,
      line: parsed.data.line_number ?? 0,
      text: (parsed.data.lines?.text ?? "").trimEnd(),
    };
  } catch {
    return null;
  }
}

function grepWithRg(
  root: string,
  pattern: string,
  limit: number,
): Promise<ProjectGrepHit[] | { error: string }> {
  return new Promise((resolve) => {
    const hits: ProjectGrepHit[] = [];
    const child = spawn(
      "rg",
      [
        "--json",
        "--max-count",
        "3",
        "--glob",
        "!node_modules/**",
        "--glob",
        "!.git/**",
        "--glob",
        "!dist/**",
        "-e",
        pattern,
        root,
      ],
      { cwd: root, timeout: 15_000 },
    );
    let stderr = "";
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.stdout.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        if (!line.trim() || hits.length >= limit) continue;
        const hit = parseRgLine(root, line);
        if (hit) hits.push(hit);
      }
    });
    child.on("error", () => resolve({ error: "ripgrep (rg) is not available on this system." }));
    child.on("close", (code) => {
      if (hits.length > 0) {
        resolve(hits);
        return;
      }
      if (code === 0 || code === 1) resolve([]);
      else resolve({ error: stderr.trim() || `grep failed (exit ${code ?? "unknown"})` });
    });
  });
}

export function registerProjectGrepIpc(
  ipcMain: IpcMain,
  getProjectRoot: () => string | null,
): void {
  ipcMain.handle(
    "project:grep",
    async (
      _event,
      pattern: unknown,
      limit?: unknown,
    ): Promise<{ hits: ProjectGrepHit[] } | { error: string }> => {
      if (typeof pattern !== "string" || pattern.trim().length < 1) {
        return { error: "Invalid grep pattern." };
      }
      if (pattern.length > 200) {
        return { error: "Grep pattern too long." };
      }
      const root = getProjectRoot();
      if (!root) {
        return { error: "No project open." };
      }
      const lim =
        typeof limit === "number" && Number.isFinite(limit)
          ? Math.min(Math.max(1, Math.floor(limit)), 80)
          : 40;
      const result = await grepWithRg(path.resolve(root), pattern.trim(), lim);
      if ("error" in result) return result;
      return { hits: result };
    },
  );
}
