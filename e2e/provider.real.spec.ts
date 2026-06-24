import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
  dismissBlockingDialogs,
  getMainWindow,
  launchStudioApp,
  waitForAgentReady,
} from "./helpers/studio";
import {
  realProviderSmokeReady,
  realProviderSkipReason,
  resolveRealProviderEnv,
} from "./helpers/realProvider";

const smokeReady = realProviderSmokeReady();
const expectedProvider = resolveRealProviderEnv();

test.describe("Real provider smoke", () => {
  test.skip(!smokeReady, realProviderSkipReason());

  let app: ElectronApplication;
  let page: Page;

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    app = await launchStudioApp({ mockProvider: false });
    page = await getMainWindow(app);
    await waitForAgentReady(page);
  });

  test.afterAll(async () => {
    await app.close();
  });

  test("seeds configured provider (not mock)", async () => {
    await page.waitForFunction(
      () => typeof window.__studioTestHooks?.getProviderSmokeState === "function",
      undefined,
      { timeout: 60_000 },
    );
    await page.waitForFunction(
      (providerId) => {
        const state = window.__studioTestHooks?.getProviderSmokeState?.();
        return Boolean(
          state &&
            !state.mockMode &&
            state.provider === providerId &&
            state.model &&
            state.model !== "mock-deterministic",
        );
      },
      expectedProvider?.provider ?? null,
      { timeout: 90_000 },
    );

    const state = await page.evaluate(() => window.__studioTestHooks!.getProviderSmokeState());
    expect(state.mockMode).toBe(false);
    expect(state.provider).toBe(expectedProvider?.provider ?? null);
    expect(state.model).toBeTruthy();
    expect(state.model).not.toBe("mock-deterministic");
  });

  test("passes provider health check", async () => {
    const health = await page.evaluate(async () => {
      const hooks = window.__studioTestHooks;
      if (!hooks?.checkConfiguredProviderHealth) {
        throw new Error("checkConfiguredProviderHealth hook missing");
      }
      return hooks.checkConfiguredProviderHealth();
    });

    expect(health.provider).toBe(expectedProvider?.provider);
    expect(health.ok).toBe(true);
    expect(health.model).not.toBe("mock-deterministic");
    expect(health.error ?? "").not.toMatch(/mock provider/i);
  });

  test("responds to minimal smoke prompt", async () => {
    test.setTimeout(120_000);

    const response = await page.evaluate(async () => {
      const hooks = window.__studioTestHooks;
      if (!hooks?.runProviderSmokeTest) {
        throw new Error("runProviderSmokeTest hook missing");
      }
      return hooks.runProviderSmokeTest(
        "Reply with exactly the word PONG and nothing else.",
      );
    });

    expect(response.ok).toBe(true);
    expect(response.provider).toBe(expectedProvider?.provider);
    expect(response.model).not.toBe("mock-deterministic");
    expect(response.text.trim().toUpperCase()).toContain("PONG");
    await dismissBlockingDialogs(page);
  });
});
