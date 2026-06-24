import type { IpcMain } from "electron";
import type { ProjectScan } from "../projectScanner.cjs";

export interface McpHostContext {
  getProjectRoot(): string | null;
  isWithinProject(target: string): boolean;
  readFile(absPath: string): Promise<{
    content: string;
    readable: boolean;
    reason?: string;
  }>;
  listDirectory(dirPath: string): Promise<
    Array<{ name: string; path: string; type: "file" | "directory" }>
  >;
  scanProject(): Promise<ProjectScan | null>;
  getGitStatus(): Promise<unknown>;
  runVerification(): Promise<unknown>;
  semanticSearch(query: string, limit?: number): unknown[];
}

export interface McpRegisterDeps {
  ipcMain: IpcMain;
  ctx: McpHostContext;
}
