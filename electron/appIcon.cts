import { app } from "electron";
import * as path from "node:path";
import * as fs from "node:fs";

function brandingDir(): string {
  const resourceDir = path.join(process.resourcesPath, "assets", "branding");
  if (fs.existsSync(resourceDir)) {
    return resourceDir;
  }
  return path.join(app.getAppPath(), "assets", "branding");
}

/** Resolved path to the platform app icon on disk. */
export function resolveAppIconPath(): string {
  const dir = brandingDir();
  if (process.platform === "darwin") {
    const icns = path.join(dir, "icon.icns");
    if (fs.existsSync(icns)) return icns;
  }
  if (process.platform === "win32") {
    const ico = path.join(dir, "icon.ico");
    if (fs.existsSync(ico)) return ico;
  }
  const png = path.join(dir, "icon-256.png");
  if (fs.existsSync(png)) return png;
  return path.join(dir, "icon-512.png");
}
