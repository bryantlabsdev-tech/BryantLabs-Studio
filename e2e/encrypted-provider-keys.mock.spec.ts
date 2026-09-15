import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test, expect } from "@playwright/test";
import type { ElectronApplication, Page } from "playwright";
import {
  closeStudioApp,
  dismissBlockingDialogs,
  getMainWindow,
  launchStudioApp,
} from "./helpers/studio";

const FAKE_GEMINI = "AIzaSyE2eFakeRestartKey0001";

test("provider API key has-key state survives restart in a temp userData dir", async () => {
  const userDataDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "bryantlabs-encrypted-keys-"),
  );
  expect(userDataDir.includes("Application Support")).toBe(false);

  let app: ElectronApplication | undefined;
  let page: Page;
  app = await launchStudioApp({
    mockProvider: true,
    userDataDir,
    e2eProject: null,
  });
  page = await getMainWindow(app);
  await page.waitForLoadState("domcontentloaded");
  await dismissBlockingDialogs(page);

  const first = await page.evaluate(async (key) => {
    const api = window.bryantlabs;
    await api.saveProviderSettings({
      provider: "gemini",
      geminiApiKey: key,
      geminiModel: "gemini-2.5-flash",
    });
    return api.getProviderSettings();
  }, FAKE_GEMINI);
  expect(first.hasGeminiKey).toBe(true);
  expect(JSON.stringify(first)).not.toContain(FAKE_GEMINI);
  expect(JSON.stringify(first)).not.toContain("ciphertextB64");

  const health = await page.evaluate(() =>
    window.bryantlabs.checkProviderHealth("gemini"),
  );
  expect(health.ok).toBe(true);

  await closeStudioApp(app);

  app = await launchStudioApp({
    mockProvider: true,
    userDataDir,
    e2eProject: null,
  });
  page = await getMainWindow(app);
  await page.waitForLoadState("domcontentloaded");
  await dismissBlockingDialogs(page);
  const second = await page.evaluate(() => window.bryantlabs.getProviderSettings());
  expect(second.hasGeminiKey).toBe(true);
  expect(JSON.stringify(second)).not.toContain(FAKE_GEMINI);
  await closeStudioApp(app);
});
