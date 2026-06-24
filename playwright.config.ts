import { defineConfig } from "@playwright/test";

const useDist = process.env.PLAYWRIGHT_USE_DIST === "1";
const realProviderE2e = process.env.BRYANTLABS_E2E_REAL_PROVIDER === "1";
const onboardingE2e = process.env.VITE_BRYANTLABS_ONBOARDING_E2E === "1";

export default defineConfig({
  testDir: "./e2e",
  testMatch: onboardingE2e
    ? "**/onboarding.spec.ts"
    : realProviderE2e
      ? "**/*.real.spec.ts"
      : "**/*.spec.ts",
  testIgnore: onboardingE2e
    ? ["**/*.real.spec.ts"]
    : realProviderE2e
      ? []
      : ["**/*.real.spec.ts", "**/onboarding.spec.ts"],
  timeout: 120_000,
  expect: { timeout: 30_000 },
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { open: "never", outputFolder: "e2e/playwright-report" }],
  ],
  globalSetup: "./e2e/global-setup.ts",
  outputDir: "e2e/test-results",
  use: {
    trace: "on-first-retry",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  webServer: useDist
    ? undefined
    : {
        command: "npm run dev",
        url: "http://localhost:5173",
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          VITE_BRYANTLABS_E2E: "1",
        },
      },
});
