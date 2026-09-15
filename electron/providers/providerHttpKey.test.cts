import { afterEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMemorySafeStorageAdapter } from "./safeStorageAdapter.cjs";
import { createProviderSecretStore } from "./providerSecretStore.cjs";
import {
  getDecryptedApiKey,
  saveSettings,
  setProviderSettingsStoreForTests,
} from "./settings.cjs";
import { fetchJson } from "./types.cjs";

const FAKE_GEMINI = "AIzaSyFakeHttpMockKey0001";

afterEach(() => {
  setProviderSettingsStoreForTests(null);
});

describe("provider HTTP mock uses decrypted keys in main only", () => {
  it("sends the decrypted fake key to a local HTTP mock", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-provider-http-"));
    assert.equal(dir.includes("Application Support"), false);
    setProviderSettingsStoreForTests(
      createProviderSecretStore({
        settingsFile: path.join(dir, "provider-settings.json"),
        adapter: createMemorySafeStorageAdapter(),
        isAppReady: () => true,
      }),
    );
    await saveSettings({ provider: "gemini", geminiApiKey: FAKE_GEMINI });
    const key = await getDecryptedApiKey("gemini");
    assert.equal(key, FAKE_GEMINI);

    let seenKey: string | null = null;
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", "http://127.0.0.1");
      seenKey = url.searchParams.get("key");
      res.setHeader("content-type", "application/json");
      res.end(JSON.stringify({ ok: true }));
    });
    await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    assert.ok(address && typeof address === "object");
    try {
      const url = `http://127.0.0.1:${address.port}/v1beta/models/x:generateContent?key=${encodeURIComponent(key ?? "")}`;
      const res = await fetchJson(url, { method: "GET" }, 5_000);
      assert.equal(res.ok, true);
      assert.equal(seenKey, FAKE_GEMINI);
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve())),
      );
    }
  });
});
