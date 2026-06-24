import type { IpcMain } from "electron";
import {
  ensureProjectScan,
  forceProjectRescan,
  getCachedProjectScan,
  getProjectIndexStatus,
  type ProjectIndexStatus,
  type ProjectIndexUpdatedEvent,
} from "./coordinator.cjs";

export function registerProjectIndexIpc(
  ipcMain: IpcMain,
  getProjectRoot: () => string | null,
): void {
  ipcMain.handle("project:index-status", async (): Promise<ProjectIndexStatus> => {
    return getProjectIndexStatus();
  });

  ipcMain.handle("project:scan", async () => {
    const root = getProjectRoot();
    if (!root) return null;
    const cached = getCachedProjectScan();
    if (cached) return cached;
    return ensureProjectScan(root);
  });

  ipcMain.handle("project:rescan", async () => {
    const root = getProjectRoot();
    if (!root) return null;
    return forceProjectRescan(root);
  });
}

export type { ProjectIndexStatus, ProjectIndexUpdatedEvent };
