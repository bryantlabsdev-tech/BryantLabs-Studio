import { execSync } from "node:child_process";
import { projectRoot } from "./helpers/studio";

export default async function globalSetup(): Promise<void> {
  execSync("npm run build:electron", {
    cwd: projectRoot,
    stdio: "inherit",
  });

  if (process.env.PLAYWRIGHT_USE_DIST === "1") {
    execSync("npm run prebuild && vite build && npm run build:electron", {
      cwd: projectRoot,
      stdio: "inherit",
      env: {
        ...process.env,
        VITE_BRYANTLABS_E2E: "1",
        ...(process.env.VITE_BRYANTLABS_ONBOARDING_E2E === "1"
          ? { VITE_BRYANTLABS_ONBOARDING_E2E: "1" }
          : {}),
      },
    });
  }
}
