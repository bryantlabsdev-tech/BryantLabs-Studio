import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createMemorySafeStorageAdapter } from "./safeStorageAdapter.cjs";
import { posixFileMode } from "./providerSettingsIo.cjs";
import {
  createProviderSecretStore,
  listSiblingArtifacts,
  PROVIDER_SETTINGS_SCHEMA_VERSION,
} from "./providerSecretStore.cjs";

const FAKE_GEMINI = "AIzaSyFakeUnitTestKey0001";
const FAKE_ANTHROPIC = "sk-ant-fakeunittest0001";
const FAKE_GROQ = "gsk_fakeunittest0001";
const FAKE_OPENROUTER = "sk-or-fakeunittest0001";

async function tempSettingsFile(): Promise<string> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-provider-secrets-"));
  assert.equal(dir.includes("Application Support"), false);
  assert.equal(dir.includes("provider-settings.json"), false);
  return path.join(dir, "provider-settings.json");
}

function v1Payload(keys: Record<string, string>): Record<string, unknown> {
  return {
    provider: "gemini",
    geminiModel: "gemini-2.5-flash",
    geminiApiKey: keys.gemini ?? "",
    ollamaModel: "llama3.2",
    ollamaBaseUrl: "http://localhost:11434",
    anthropicModel: "",
    anthropicApiKey: keys.anthropic ?? "",
    groqModel: "llama-3.3-70b-versatile",
    groqApiKey: keys.groq ?? "",
    openrouterModel: "openai/gpt-4.1-mini",
    openrouterApiKey: keys.openrouter ?? "",
  };
}

async function writeJson(file: string, data: unknown): Promise<void> {
  await fs.writeFile(file, `${JSON.stringify(data, null, 2)}\n`, "utf8");
}

async function readJson(file: string): Promise<Record<string, unknown>> {
  return JSON.parse(await fs.readFile(file, "utf8")) as Record<string, unknown>;
}

describe("provider secret store", () => {
  it("migrates legacy v1 plaintext to encrypted v2 and verifies the round trip", async () => {
    const settingsFile = await tempSettingsFile();
    await writeJson(settingsFile, v1Payload({ gemini: FAKE_GEMINI }));
    const store = createProviderSecretStore({
      settingsFile,
      adapter: createMemorySafeStorageAdapter(),
      isAppReady: () => true,
    });
    const doc = await store.ensureMigrated();
    assert.equal(doc.schemaVersion, PROVIDER_SETTINGS_SCHEMA_VERSION);
    assert.equal(doc.secrets.gemini.state, "encrypted");
    assert.equal(await store.getDecryptedApiKey("gemini"), FAKE_GEMINI);
    const disk = await readJson(settingsFile);
    const text = await fs.readFile(settingsFile, "utf8");
    assert.equal(disk.schemaVersion, 2);
    assert.equal(disk.geminiApiKey, "");
    assert.equal(text.includes(FAKE_GEMINI), false);
    const secrets = disk.secrets as Record<string, Record<string, string>>;
    assert.equal(secrets.gemini.state, "encrypted");
    assert.equal(Boolean(secrets.gemini.ciphertextB64), true);
    assert.equal("plaintext" in secrets.gemini, false);
    const artifacts = await listSiblingArtifacts(settingsFile);
    assert.equal(artifacts.length, 0);
    if (process.platform !== "win32") {
      assert.equal(posixFileMode((await fs.stat(settingsFile)).mode), 0o600);
    }
  });

  it("keeps the plaintext backup until verification succeeds, then removes it", async () => {
    const settingsFile = await tempSettingsFile();
    await writeJson(settingsFile, v1Payload({ gemini: FAKE_GEMINI }));
    let backupDuringMigrate = 0;
    const store = createProviderSecretStore({
      settingsFile,
      adapter: createMemorySafeStorageAdapter(),
      isAppReady: () => true,
      async afterBackup() {
        const artifacts = await listSiblingArtifacts(settingsFile);
        backupDuringMigrate = artifacts.filter((item) =>
          item.includes("plaintext-backup"),
        ).length;
        const backup = artifacts[0];
        assert.ok(backup);
        if (process.platform !== "win32") {
          assert.equal(posixFileMode((await fs.stat(backup)).mode), 0o600);
        }
      },
    });
    await store.ensureMigrated();
    assert.equal(backupDuringMigrate, 1);
    const leftovers = await listSiblingArtifacts(settingsFile);
    assert.equal(leftovers.length, 0);
  });

  it("keeps the original and backup if work after backup crashes", async () => {
    const settingsFile = await tempSettingsFile();
    await writeJson(settingsFile, v1Payload({ gemini: FAKE_GEMINI }));
    const store = createProviderSecretStore({
      settingsFile,
      adapter: createMemorySafeStorageAdapter(),
      isAppReady: () => true,
      afterBackup() {
        throw new Error("simulated crash");
      },
    });
    const doc = await store.ensureMigrated();
    assert.equal(doc.schemaVersion, 1);
    assert.equal(doc.secrets.gemini.plaintext, FAKE_GEMINI);
    const disk = await readJson(settingsFile);
    assert.equal(disk.geminiApiKey, FAKE_GEMINI);
    const artifacts = await listSiblingArtifacts(settingsFile);
    assert.equal(artifacts.some((item) => item.includes("plaintext-backup")), true);
  });

  it("retains the original file when rename fails after backup", async () => {
    const settingsFile = await tempSettingsFile();
    await writeJson(settingsFile, v1Payload({ gemini: FAKE_GEMINI }));
    const store = createProviderSecretStore({
      settingsFile,
      adapter: createMemorySafeStorageAdapter(),
      isAppReady: () => true,
      failBeforeRename: true,
    });
    const doc = await store.ensureMigrated();
    assert.equal(doc.schemaVersion, 1);
    assert.equal(doc.secrets.gemini.plaintext, FAKE_GEMINI);
    const disk = await readJson(settingsFile);
    assert.equal(disk.geminiApiKey, FAKE_GEMINI);
    const artifacts = await listSiblingArtifacts(settingsFile);
    assert.equal(artifacts.some((item) => item.includes("plaintext-backup")), true);
  });

  it("restores the backup when decrypt verification fails", async () => {
    const settingsFile = await tempSettingsFile();
    await writeJson(settingsFile, v1Payload({ gemini: FAKE_GEMINI }));
    const store = createProviderSecretStore({
      settingsFile,
      adapter: createMemorySafeStorageAdapter({
        decrypt() {
          return "tampered-value";
        },
      }),
      isAppReady: () => true,
    });
    const doc = await store.ensureMigrated();
    assert.equal(doc.schemaVersion, 1);
    assert.equal(doc.secrets.gemini.plaintext, FAKE_GEMINI);
    const disk = await readJson(settingsFile);
    assert.equal(disk.geminiApiKey, FAKE_GEMINI);
    const artifacts = await listSiblingArtifacts(settingsFile);
    assert.equal(artifacts.some((item) => item.includes("plaintext-backup")), true);
  });

  it("retains plaintext-legacy with a warning when encryption is unavailable", async () => {
    const settingsFile = await tempSettingsFile();
    await writeJson(settingsFile, v1Payload({ gemini: FAKE_GEMINI }));
    const store = createProviderSecretStore({
      settingsFile,
      adapter: createMemorySafeStorageAdapter({ available: false }),
      isAppReady: () => true,
    });
    const doc = await store.ensureMigrated();
    assert.equal(doc.secrets.gemini.state, "plaintext-legacy");
    assert.equal(await store.getDecryptedApiKey("gemini"), FAKE_GEMINI);
    const status = store.statusFrom(doc);
    assert.equal(status.encryptionAvailable, false);
    assert.match(status.userMessage ?? "", /reduced protection/);
    const disk = await readJson(settingsFile);
    assert.equal(disk.geminiApiKey, "");
    const secrets = disk.secrets as Record<string, Record<string, string>>;
    assert.equal(secrets.gemini.state, "plaintext-legacy");
    assert.equal(secrets.gemini.plaintext, FAKE_GEMINI);
  });

  it("migrates mixed records without losing a key that failed to encrypt", async () => {
    const settingsFile = await tempSettingsFile();
    await writeJson(
      settingsFile,
      v1Payload({ gemini: FAKE_GEMINI, groq: FAKE_GROQ }),
    );
    const store = createProviderSecretStore({
      settingsFile,
      adapter: createMemorySafeStorageAdapter({
        encrypt(plain) {
          if (plain === FAKE_GROQ) throw new Error("encrypt failed");
          return Buffer.from(`mem1:${plain}`, "utf8");
        },
      }),
      isAppReady: () => true,
    });
    const doc = await store.ensureMigrated();
    assert.equal(doc.secrets.gemini.state, "encrypted");
    assert.equal(doc.secrets.groq.state, "plaintext-legacy");
    assert.equal(await store.getDecryptedApiKey("gemini"), FAKE_GEMINI);
    assert.equal(await store.getDecryptedApiKey("groq"), FAKE_GROQ);
  });

  it("keeps corrupt ciphertext represented as undecryptable", async () => {
    const settingsFile = await tempSettingsFile();
    await writeJson(settingsFile, {
      schemaVersion: 2,
      geminiApiKey: "",
      secrets: {
        gemini: {
          state: "encrypted",
          algorithm: "electron-safeStorage-v1",
          ciphertextB64: Buffer.from("not-valid-ciphertext").toString("base64"),
        },
      },
    });
    const store = createProviderSecretStore({
      settingsFile,
      adapter: createMemorySafeStorageAdapter(),
      isAppReady: () => true,
    });
    const doc = await store.load();
    assert.equal(doc.secrets.gemini.state, "undecryptable");
    assert.equal(await store.getDecryptedApiKey("gemini"), null);
    const disk = await readJson(settingsFile);
    const secrets = disk.secrets as Record<string, Record<string, string>>;
    assert.equal(secrets.gemini.state, "encrypted");
    assert.equal(Boolean(secrets.gemini.ciphertextB64), true);
    const status = store.statusFrom(doc);
    assert.match(status.userMessage ?? "", /cannot be decrypted/);
  });

  it("quarantines corrupt JSON and does not write defaults", async () => {
    const settingsFile = await tempSettingsFile();
    await fs.writeFile(settingsFile, "{not-json", "utf8");
    const store = createProviderSecretStore({
      settingsFile,
      adapter: createMemorySafeStorageAdapter(),
      isAppReady: () => true,
    });
    const doc = await store.load();
    assert.equal(doc.fileStatus, "quarantined");
    await assert.rejects(() => fs.readFile(settingsFile, "utf8"), /ENOENT/);
    const artifacts = await listSiblingArtifacts(settingsFile);
    assert.equal(artifacts.length, 1);
    if (process.platform !== "win32") {
      assert.equal(posixFileMode((await fs.stat(artifacts[0])).mode), 0o600);
    }
    const names = await fs.readdir(path.dirname(settingsFile));
    assert.equal(names.includes("provider-settings.json"), false);
  });

  it("leaves an unknown future schema untouched", async () => {
    const settingsFile = await tempSettingsFile();
    const future = {
      schemaVersion: 99,
      geminiApiKey: "",
      marker: "future-build",
    };
    await writeJson(settingsFile, future);
    const store = createProviderSecretStore({
      settingsFile,
      adapter: createMemorySafeStorageAdapter(),
      isAppReady: () => true,
    });
    const doc = await store.load();
    assert.equal(doc.fileStatus, "unsupported_schema");
    assert.equal(doc.persistBlocked, true);
    const disk = await readJson(settingsFile);
    assert.equal(disk.schemaVersion, 99);
    assert.equal(disk.marker, "future-build");
    await assert.rejects(
      () => store.persist({ provider: "gemini" }, doc.secrets),
      /newer version/,
    );
    const after = await readJson(settingsFile);
    assert.equal(after.schemaVersion, 99);
  });

  it("retains has-key state across a new store using the same temp directory", async () => {
    const settingsFile = await tempSettingsFile();
    const first = createProviderSecretStore({
      settingsFile,
      adapter: createMemorySafeStorageAdapter(),
      isAppReady: () => true,
    });
    const secrets = {
      gemini: await first.encryptOrLegacy(FAKE_GEMINI),
      anthropic: { state: "empty" as const },
      groq: { state: "empty" as const },
      openrouter: { state: "empty" as const },
    };
    await first.persist({ provider: "gemini" }, secrets);
    const second = createProviderSecretStore({
      settingsFile,
      adapter: createMemorySafeStorageAdapter(),
      isAppReady: () => true,
    });
    const doc = await second.load();
    assert.equal(doc.secrets.gemini.state, "encrypted");
    assert.equal(await second.getDecryptedApiKey("gemini"), FAKE_GEMINI);
  });

  it("never copies a real Application Support settings file in tests", async () => {
    const settingsFile = await tempSettingsFile();
    assert.equal(settingsFile.includes("Application Support"), false);
    assert.ok(settingsFile.includes(os.tmpdir()) || settingsFile.includes("/T/"));
    void FAKE_ANTHROPIC;
    void FAKE_OPENROUTER;
  });
});
