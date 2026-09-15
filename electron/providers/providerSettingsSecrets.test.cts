import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMemorySafeStorageAdapter } from "./safeStorageAdapter.cjs";
import { createProviderSecretStore } from "./providerSecretStore.cjs";
import {
  getDecryptedApiKey,
  getSettingsView,
  revealApiKey,
  saveSettings,
  setProviderSettingsStoreForTests,
} from "./settings.cjs";

const FAKE_GEMINI = "AIzaSyFakeSettingsKey0001";
const FAKE_REPLACE = "AIzaSyFakeReplacementKey0001";

async function bindTempStore(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-provider-settings-"));
  assert.equal(dir.includes("Application Support"), false);
  const settingsFile = path.join(dir, "provider-settings.json");
  setProviderSettingsStoreForTests(
    createProviderSecretStore({
      settingsFile,
      adapter: createMemorySafeStorageAdapter(),
      isAppReady: () => true,
    }),
  );
  return settingsFile;
}

afterEach(() => {
  setProviderSettingsStoreForTests(null);
});

describe("provider settings secret IPC behavior", () => {
  it("saves, replaces, removes, previews, and reveals without leaking secrets in getSettings", async () => {
    const settingsFile = await bindTempStore();
    const saved = await saveSettings({
      provider: "gemini",
      geminiApiKey: FAKE_GEMINI,
    });
    assert.equal(saved.hasGeminiKey, true);
    assert.ok(saved.geminiKeyPreview);
    assert.equal(saved.geminiKeyPreview?.includes(FAKE_GEMINI), false);
    const serialized = JSON.stringify(saved);
    assert.equal(serialized.includes(FAKE_GEMINI), false);
    assert.equal(serialized.includes("ciphertextB64"), false);
    assert.equal(await getDecryptedApiKey("gemini"), FAKE_GEMINI);

    const revealed = await revealApiKey("gemini");
    assert.equal(revealed.ok, true);
    assert.equal(revealed.key, FAKE_GEMINI);

    const replaced = await saveSettings({ geminiApiKey: FAKE_REPLACE });
    assert.equal(replaced.hasGeminiKey, true);
    assert.equal(await getDecryptedApiKey("gemini"), FAKE_REPLACE);
    assert.equal(JSON.stringify(replaced).includes(FAKE_REPLACE), false);

    const cleared = await saveSettings({ geminiApiKey: "" });
    assert.equal(cleared.hasGeminiKey, false);
    assert.equal(await getDecryptedApiKey("gemini"), null);

    const disk = JSON.parse(await fs.readFile(settingsFile, "utf8")) as {
      geminiApiKey: string;
      secrets?: { gemini?: { state?: string } };
    };
    assert.equal(disk.geminiApiKey, "");
    assert.equal(disk.secrets?.gemini?.state ?? "empty", "empty");
  });

  it("keeps an undecryptable key stored until the user replaces it", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-provider-undec-"));
    const settingsFile = path.join(dir, "provider-settings.json");
    await fs.writeFile(
      settingsFile,
      `${JSON.stringify({
        schemaVersion: 2,
        geminiApiKey: "",
        secrets: {
          gemini: {
            state: "encrypted",
            algorithm: "electron-safeStorage-v1",
            ciphertextB64: Buffer.from("broken").toString("base64"),
          },
        },
      })}\n`,
      "utf8",
    );
    setProviderSettingsStoreForTests(
      createProviderSecretStore({
        settingsFile,
        adapter: createMemorySafeStorageAdapter(),
        isAppReady: () => true,
      }),
    );
    const view = await getSettingsView();
    assert.equal(view.hasGeminiKey, true);
    assert.equal(view.geminiKeyPreview, null);
    assert.equal(view.secretProtection.gemini, "undecryptable");
    const revealed = await revealApiKey("gemini");
    assert.equal(revealed.ok, false);
    const replaced = await saveSettings({ geminiApiKey: FAKE_REPLACE });
    assert.equal(replaced.hasGeminiKey, true);
    assert.equal(await getDecryptedApiKey("gemini"), FAKE_REPLACE);
  });
});
