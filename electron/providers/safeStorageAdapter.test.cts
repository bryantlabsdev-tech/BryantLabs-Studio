import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  createSafeStorageAdapter,
  isLinuxSafeStorageBackendAccepted,
  isSafeStorageUsable,
} from "./safeStorageAdapter.cjs";

describe("safeStorage adapter", () => {
  it("treats isEncryptionAvailable false as unavailable", () => {
    assert.equal(
      isSafeStorageUsable({
        platform: "darwin",
        encryptionAvailable: false,
        selectedBackend: "keychain",
      }),
      false,
    );
  });

  it("rejects Linux basic_text as unavailable", () => {
    assert.equal(isLinuxSafeStorageBackendAccepted("basic_text"), false);
    assert.equal(
      isSafeStorageUsable({
        platform: "linux",
        encryptionAvailable: true,
        selectedBackend: "basic_text",
      }),
      false,
    );
  });

  it("rejects unknown Linux backends as unavailable", () => {
    assert.equal(isLinuxSafeStorageBackendAccepted("not_a_real_backend"), false);
    assert.equal(
      isSafeStorageUsable({
        platform: "linux",
        encryptionAvailable: true,
        selectedBackend: "unknown",
      }),
      false,
    );
  });

  it("accepts known Linux libsecret/kwallet backends", () => {
    assert.equal(isLinuxSafeStorageBackendAccepted("gnome_libsecret"), true);
    assert.equal(isLinuxSafeStorageBackendAccepted("kwallet6"), true);
  });

  it("does not encrypt before app.ready or when Linux basic_text is selected", async () => {
    let encryptCalls = 0;
    const adapter = createSafeStorageAdapter({
      isAppReady: () => false,
      platform: "linux",
      electronSafeStorage: {
        isEncryptionAvailable: () => true,
        getSelectedStorageBackend: () => "basic_text",
        encryptString() {
          encryptCalls += 1;
          throw new Error("should not encrypt");
        },
        decryptString() {
          throw new Error("should not decrypt");
        },
        setUsePlainTextEncryption() {
          throw new Error("must never enable plaintext encryption");
        },
      },
    });
    assert.equal(adapter.isEncryptionAvailable(), false);
    await assert.rejects(() => adapter.encryptString("x"), /not available/);
    assert.equal(encryptCalls, 0);

    const linuxReady = createSafeStorageAdapter({
      isAppReady: () => true,
      platform: "linux",
      electronSafeStorage: {
        isEncryptionAvailable: () => true,
        getSelectedStorageBackend: () => "basic_text",
        encryptString() {
          encryptCalls += 1;
          throw new Error("should not encrypt");
        },
        decryptString() {
          throw new Error("should not decrypt");
        },
      },
    });
    assert.equal(linuxReady.isEncryptionAvailable(), false);
    await assert.rejects(() => linuxReady.encryptString("x"), /not available/);
    assert.equal(encryptCalls, 0);
  });
});
