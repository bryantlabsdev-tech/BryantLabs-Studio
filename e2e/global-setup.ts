import { existsSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";
import { projectRoot } from "./helpers/studio";

export const REQUIRED_DIST_OUTPUTS = [
  "dist/index.html",
  "dist-electron/main.cjs",
] as const;

export function missingPlaywrightDistOutputs(
  root: string = projectRoot,
): string[] {
  return REQUIRED_DIST_OUTPUTS.filter((rel) => !existsSync(join(root, rel)));
}

export function assertPlaywrightDistBuildReady(root: string = projectRoot): void {
  const missing = missingPlaywrightDistOutputs(root);
  if (missing.length === 0) return;
  throw new Error(
    `PLAYWRIGHT_USE_DIST=1 requires prebuilt outputs, but missing: ${missing.join(", ")}. Run \`npm run build\` with VITE_BRYANTLABS_E2E=1 before Playwright.`,
  );
}

export default async function globalSetup(): Promise<void> {
  if (process.env.PLAYWRIGHT_USE_DIST === "1") {
    assertPlaywrightDistBuildReady();
    return;
  }

  execSync("npm run build:electron", {
    cwd: projectRoot,
    stdio: "inherit",
  });
}
