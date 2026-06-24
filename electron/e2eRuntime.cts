import { app } from "electron";
import * as path from "node:path";

/** Isolated userData for Playwright runs (must run before app.ready). */
export function configureE2eRuntimePaths(): void {
  if (app.isReady()) return;
  const userData = process.env.BRYANTLABS_E2E_USER_DATA;
  if (userData && typeof userData === "string" && userData.trim()) {
    app.setPath("userData", path.resolve(userData.trim()));
  }
}
