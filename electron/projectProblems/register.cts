import type { BrowserWindow, IpcMain } from "electron";
import {
  bindProjectProblemsWindow,
  getProjectProblemsStatus,
  refreshProjectProblems,
  type ProjectProblemsStatus,
} from "./service.cjs";

export function registerProjectProblemsIpc(
  ipcMain: IpcMain,
  getProjectRoot: () => string | null,
  getWindow: () => BrowserWindow | null,
): void {
  bindProjectProblemsWindow(getWindow);

  ipcMain.handle(
    "project:problems-status",
    async (): Promise<ProjectProblemsStatus> => {
      return getProjectProblemsStatus();
    },
  );

  ipcMain.handle("project:problems-refresh", async (): Promise<ProjectProblemsStatus> => {
    const root = getProjectRoot();
    if (!root) return getProjectProblemsStatus();
    return refreshProjectProblems(root);
  });
}
