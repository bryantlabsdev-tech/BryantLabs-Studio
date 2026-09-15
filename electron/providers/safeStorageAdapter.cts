/**
 * Injectable wrapper around Electron safeStorage.
 * Never encrypts before app.ready. Never enables plaintext encryption.
 */

export const ELECTRON_SAFE_STORAGE_ALGORITHM = "electron-safeStorage-v1";

const LINUX_SECURE_BACKENDS = new Set([
  "gnome_libsecret",
  "kwallet",
  "kwallet5",
  "kwallet6",
]);

export interface SafeStorageBackendInfo {
  readonly platform: string;
  readonly encryptionAvailable: boolean;
  readonly selectedBackend?: string | null;
}

export interface SafeStorageAdapter {
  isEncryptionAvailable(): boolean;
  encryptString(plain: string): Promise<Buffer>;
  decryptString(payload: Buffer): Promise<string>;
}

export interface ElectronSafeStorageLike {
  isEncryptionAvailable(): boolean;
  getSelectedStorageBackend?: () => string;
  encryptString(plain: string): Buffer | Promise<Buffer>;
  decryptString(payload: Buffer): string | Promise<string>;
  setUsePlainTextEncryption?: (use: boolean) => void;
}

export function isLinuxSafeStorageBackendAccepted(
  backend: string | null | undefined,
): boolean {
  if (typeof backend !== "string" || backend.trim().length === 0) return false;
  return LINUX_SECURE_BACKENDS.has(backend.trim());
}

/** Linux basic_text and unknown backends are treated as unavailable. */
export function isSafeStorageUsable(info: SafeStorageBackendInfo): boolean {
  if (!info.encryptionAvailable) return false;
  if (info.platform === "linux") {
    return isLinuxSafeStorageBackendAccepted(info.selectedBackend);
  }
  return true;
}

export function createSafeStorageAdapter(opts: {
  isAppReady: () => boolean;
  platform: string;
  electronSafeStorage: ElectronSafeStorageLike;
}): SafeStorageAdapter {
  const evaluate = (): boolean => {
    if (!opts.isAppReady()) return false;
    const encryptionAvailable = opts.electronSafeStorage.isEncryptionAvailable();
    const selectedBackend =
      typeof opts.electronSafeStorage.getSelectedStorageBackend === "function"
        ? opts.electronSafeStorage.getSelectedStorageBackend()
        : null;
    return isSafeStorageUsable({
      platform: opts.platform,
      encryptionAvailable,
      selectedBackend,
    });
  };

  return {
    isEncryptionAvailable(): boolean {
      return evaluate();
    },
    async encryptString(plain: string): Promise<Buffer> {
      if (!opts.isAppReady()) {
        throw new Error("Encryption is not available until the app is ready.");
      }
      if (!evaluate()) {
        throw new Error("Secure encryption is not available.");
      }
      const result = opts.electronSafeStorage.encryptString(plain);
      const buffer = result instanceof Promise ? await result : result;
      return Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
    },
    async decryptString(payload: Buffer): Promise<string> {
      if (!opts.isAppReady()) {
        throw new Error("Decryption is not available until the app is ready.");
      }
      const result = opts.electronSafeStorage.decryptString(payload);
      return result instanceof Promise ? await result : result;
    },
  };
}

export function createElectronSafeStorageAdapter(
  electron: {
    app: { isReady: () => boolean };
    safeStorage: ElectronSafeStorageLike;
  },
  platform: string = process.platform,
): SafeStorageAdapter {
  return createSafeStorageAdapter({
    isAppReady: () => electron.app.isReady(),
    platform,
    electronSafeStorage: electron.safeStorage,
  });
}

export function createMemorySafeStorageAdapter(opts?: {
  available?: boolean;
  encrypt?: (plain: string) => Promise<Buffer> | Buffer;
  decrypt?: (payload: Buffer) => Promise<string> | string;
}): SafeStorageAdapter {
  const available = opts?.available !== false;
  return {
    isEncryptionAvailable(): boolean {
      return available;
    },
    async encryptString(plain: string): Promise<Buffer> {
      if (!available) throw new Error("Secure encryption is not available.");
      if (opts?.encrypt) {
        const result = opts.encrypt(plain);
        return result instanceof Promise ? await result : result;
      }
      return Buffer.from(`mem1:${plain}`, "utf8");
    },
    async decryptString(payload: Buffer): Promise<string> {
      if (opts?.decrypt) {
        const result = opts.decrypt(payload);
        return result instanceof Promise ? await result : result;
      }
      const text = payload.toString("utf8");
      if (!text.startsWith("mem1:")) {
        throw new Error("Ciphertext could not be decrypted.");
      }
      return text.slice("mem1:".length);
    },
  };
}
