#!/usr/bin/env node
/**
 * Copy confirmation HTML next to the compiled Electron main process.
 * Node copy keeps `npm run build:electron` working on Windows cmd.exe.
 */
import { copyFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dest = path.join(root, "dist-electron");
mkdirSync(dest, { recursive: true });
for (const name of ["projectCodeConfirm.html", "packageScriptConfirm.html"]) {
  copyFileSync(path.join(root, "electron", name), path.join(dest, name));
}
