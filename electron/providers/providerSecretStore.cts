import { promises as fs } from "node:fs";
import * as path from "node:path";
import { timingSafeEqual } from "node:crypto";
import {
  ELECTRON_SAFE_STORAGE_ALGORITHM,
  type SafeStorageAdapter,
} from "./safeStorageAdapter.cjs";
import {
  chmodProviderSettingsFile,
  copyFileSecure,
  writeJsonAtomicSecure,
} from "./providerSettingsIo.cjs";

export const PROVIDER_SETTINGS_SCHEMA_VERSION = 2;

export const SECRET_PROVIDER_IDS = [
  "gemini",
  "anthropic",
  "groq",
  "openrouter",
] as const;

export type SecretProviderId = (typeof SECRET_PROVIDER_IDS)[number];

export type SecretRecordState =
  | "empty"
  | "encrypted"
  | "plaintext-legacy"
  | "undecryptable";

export type ProviderSettingsFileStatus =
  | "ok"
  | "missing"
  | "quarantined"
  | "unsupported_schema";

export interface SecretRecord {
  state: SecretRecordState;
  plaintext?: string;
  algorithm?: string;
  ciphertextB64?: string;
}

export type SecretMap = Record<SecretProviderId, SecretRecord>;

export interface ProviderSecretsStatus {
  encryptionAvailable: boolean;
  fileStatus: ProviderSettingsFileStatus;
  gemini: SecretRecordState;
  anthropic: SecretRecordState;
  groq: SecretRecordState;
  openrouter: SecretRecordState;
  userMessage: string | null;
}

export const PROVIDER_SECRET_STATUS_MESSAGES = {
  encryptionUnavailable:
    "API keys are stored with reduced protection on this device.",
  undecryptable: "This API key cannot be decrypted. Replace it in Settings.",
  quarantined:
    "Provider settings were unreadable and were set aside. Re-enter your API keys to continue.",
  unsupportedSchema:
    "Provider settings were written by a newer version of BryantLabs Studio and were not changed.",
} as const;

export interface ProviderSecretStoreDeps {
  settingsFile: string;
  adapter: SafeStorageAdapter;
  isAppReady: () => boolean;
  now?: () => number;
  failBeforeRename?: boolean;
  afterBackup?: () => Promise<void> | void;
}

export interface LoadedProviderDocument {
  fileStatus: ProviderSettingsFileStatus;
  persistBlocked: boolean;
  encryptionAvailable: boolean;
  schemaVersion: number | null;
  nonSecret: Record<string, unknown>;
  secrets: SecretMap;
  livePath: string;
  backupPath: string | null;
  quarantinePath: string | null;
}

export interface ProviderSecretStore {
  ensureMigrated(): Promise<LoadedProviderDocument>;
  load(): Promise<LoadedProviderDocument>;
  persist(
    nonSecret: Record<string, unknown>,
    secrets: SecretMap,
  ): Promise<LoadedProviderDocument>;
  getDecryptedApiKey(provider: SecretProviderId): Promise<string | null>;
  statusFrom(doc: LoadedProviderDocument): ProviderSecretsStatus;
  encryptOrLegacy(plain: string): Promise<SecretRecord>;
}

function emptySecrets(): SecretMap {
  return {
    gemini: { state: "empty" },
    anthropic: { state: "empty" },
    groq: { state: "empty" },
    openrouter: { state: "empty" },
  };
}

function emptyRecord(): SecretRecord {
  return { state: "empty" };
}

function stamp(now: number): string {
  return new Date(now).toISOString().replace(/[:.]/g, "-");
}

function timingEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, "utf8");
  const right = Buffer.from(b, "utf8");
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

function legacyKeyField(id: SecretProviderId): string {
  switch (id) {
    case "gemini":
      return "geminiApiKey";
    case "anthropic":
      return "anthropicApiKey";
    case "groq":
      return "groqApiKey";
    case "openrouter":
      return "openrouterApiKey";
  }
}

function parseSecretRecord(raw: unknown): SecretRecord {
  if (!raw || typeof raw !== "object") return emptyRecord();
  const o = raw as Record<string, unknown>;
  const state = o.state;
  if (state === "encrypted") {
    const algorithm = typeof o.algorithm === "string" ? o.algorithm : "";
    const ciphertextB64 =
      typeof o.ciphertextB64 === "string" ? o.ciphertextB64 : "";
    if (!algorithm || !ciphertextB64) {
      return {
        state: "undecryptable",
        algorithm: algorithm || undefined,
        ciphertextB64: ciphertextB64 || undefined,
      };
    }
    return { state: "encrypted", algorithm, ciphertextB64 };
  }
  if (state === "plaintext-legacy") {
    const plaintext = typeof o.plaintext === "string" ? o.plaintext : "";
    if (!plaintext.trim()) return emptyRecord();
    return { state: "plaintext-legacy", plaintext };
  }
  if (state === "undecryptable") {
    return {
      state: "undecryptable",
      algorithm: typeof o.algorithm === "string" ? o.algorithm : undefined,
      ciphertextB64:
        typeof o.ciphertextB64 === "string" ? o.ciphertextB64 : undefined,
    };
  }
  return emptyRecord();
}

function diskSecret(record: SecretRecord): Record<string, unknown> | undefined {
  if (record.state === "empty") return undefined;
  if (record.state === "encrypted") {
    return {
      state: "encrypted",
      algorithm: record.algorithm ?? ELECTRON_SAFE_STORAGE_ALGORITHM,
      ciphertextB64: record.ciphertextB64 ?? "",
    };
  }
  if (record.state === "plaintext-legacy") {
    return { state: "plaintext-legacy", plaintext: record.plaintext ?? "" };
  }
  return {
    state: "undecryptable",
    ...(record.algorithm ? { algorithm: record.algorithm } : {}),
    ...(record.ciphertextB64 ? { ciphertextB64: record.ciphertextB64 } : {}),
  };
}

function serializeV2(
  nonSecret: Record<string, unknown>,
  secrets: SecretMap,
): Record<string, unknown> {
  const secretsOut: Record<string, unknown> = {};
  for (const id of SECRET_PROVIDER_IDS) {
    const encoded = diskSecret(secrets[id]);
    if (encoded) secretsOut[id] = encoded;
  }
  const {
    geminiApiKey: _g,
    anthropicApiKey: _a,
    groqApiKey: _q,
    openrouterApiKey: _o,
    schemaVersion: _s,
    secrets: _sec,
    ...rest
  } = nonSecret;
  void _g;
  void _a;
  void _q;
  void _o;
  void _s;
  void _sec;
  return {
    ...rest,
    schemaVersion: PROVIDER_SETTINGS_SCHEMA_VERSION,
    geminiApiKey: "",
    anthropicApiKey: "",
    groqApiKey: "",
    openrouterApiKey: "",
    secrets: secretsOut,
  };
}

function hasUsableSecret(record: SecretRecord): boolean {
  return record.state !== "empty";
}

export function statusFromDocument(
  doc: LoadedProviderDocument,
): ProviderSecretsStatus {
  let userMessage: string | null = null;
  if (doc.fileStatus === "quarantined") {
    userMessage = PROVIDER_SECRET_STATUS_MESSAGES.quarantined;
  } else if (doc.fileStatus === "unsupported_schema") {
    userMessage = PROVIDER_SECRET_STATUS_MESSAGES.unsupportedSchema;
  } else if (
    SECRET_PROVIDER_IDS.some((id) => doc.secrets[id].state === "undecryptable")
  ) {
    userMessage = PROVIDER_SECRET_STATUS_MESSAGES.undecryptable;
  } else if (
    !doc.encryptionAvailable &&
    SECRET_PROVIDER_IDS.some(
      (id) => doc.secrets[id].state === "plaintext-legacy",
    )
  ) {
    userMessage = PROVIDER_SECRET_STATUS_MESSAGES.encryptionUnavailable;
  }
  return {
    encryptionAvailable: doc.encryptionAvailable,
    fileStatus: doc.fileStatus,
    gemini: doc.secrets.gemini.state,
    anthropic: doc.secrets.anthropic.state,
    groq: doc.secrets.groq.state,
    openrouter: doc.secrets.openrouter.state,
    userMessage,
  };
}

async function decryptRecord(
  adapter: SafeStorageAdapter,
  record: SecretRecord,
): Promise<SecretRecord> {
  if (record.state === "encrypted") {
    try {
      const buf = Buffer.from(record.ciphertextB64 ?? "", "base64");
      const plaintext = await adapter.decryptString(buf);
      if (!plaintext) {
        return { ...record, state: "undecryptable", plaintext: undefined };
      }
      return { ...record, plaintext };
    } catch {
      return { ...record, state: "undecryptable", plaintext: undefined };
    }
  }
  return record;
}

async function hydrateSecrets(
  adapter: SafeStorageAdapter,
  secrets: SecretMap,
): Promise<SecretMap> {
  const next = emptySecrets();
  for (const id of SECRET_PROVIDER_IDS) {
    next[id] = await decryptRecord(adapter, secrets[id]);
  }
  return next;
}

function parseV1LegacyKeys(parsed: Record<string, unknown>): SecretMap {
  const secrets = emptySecrets();
  for (const id of SECRET_PROVIDER_IDS) {
    const field = legacyKeyField(id);
    const value = parsed[field];
    if (typeof value === "string" && value.trim()) {
      secrets[id] = { state: "plaintext-legacy", plaintext: value };
    }
  }
  return secrets;
}

function parseV2Secrets(parsed: Record<string, unknown>): SecretMap {
  const secrets = emptySecrets();
  const rawSecrets =
    parsed.secrets && typeof parsed.secrets === "object"
      ? (parsed.secrets as Record<string, unknown>)
      : {};
  for (const id of SECRET_PROVIDER_IDS) {
    secrets[id] = parseSecretRecord(rawSecrets[id]);
  }
  return secrets;
}

export async function encryptPlaintext(
  adapter: SafeStorageAdapter,
  encryptionAvailable: boolean,
  plain: string,
): Promise<SecretRecord> {
  const trimmed = plain.trim();
  if (!trimmed) return emptyRecord();
  if (!encryptionAvailable) {
    return { state: "plaintext-legacy", plaintext: trimmed };
  }
  try {
    const buf = await adapter.encryptString(trimmed);
    return {
      state: "encrypted",
      algorithm: ELECTRON_SAFE_STORAGE_ALGORITHM,
      ciphertextB64: buf.toString("base64"),
      plaintext: trimmed,
    };
  } catch {
    return { state: "plaintext-legacy", plaintext: trimmed };
  }
}

export function createProviderSecretStore(
  deps: ProviderSecretStoreDeps,
): ProviderSecretStore {
  const now = deps.now ?? (() => Date.now());
  let chain: Promise<unknown> = Promise.resolve();
  let cached: LoadedProviderDocument | null = null;

  const runSerialized = <T,>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };

  async function quarantineCorrupt(rawText: string): Promise<string> {
    const dir = path.dirname(deps.settingsFile);
    const dest = path.join(
      dir,
      `provider-settings.quarantine.${stamp(now())}.json`,
    );
    const moved = await copyFileSecure(deps.settingsFile, dest).catch(
      async () => {
        await fs.writeFile(dest, rawText, {
          encoding: "utf8",
          mode: 0o600,
        });
        await chmodProviderSettingsFile(dest);
        return { ok: true as const };
      },
    );
    if (!moved.ok) {
      await fs.writeFile(dest, rawText, { encoding: "utf8", mode: 0o600 });
      await chmodProviderSettingsFile(dest);
    }
    await fs.unlink(deps.settingsFile).catch(() => {});
    return dest;
  }

  async function readLiveFile(): Promise<
    | { kind: "missing" }
    | { kind: "corrupt"; text: string }
    | { kind: "json"; parsed: Record<string, unknown> }
  > {
    try {
      const text = await fs.readFile(deps.settingsFile, "utf8");
      try {
        const parsed = JSON.parse(text) as unknown;
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          return { kind: "corrupt", text };
        }
        return { kind: "json", parsed: parsed as Record<string, unknown> };
      } catch {
        return { kind: "corrupt", text };
      }
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code === "ENOENT") return { kind: "missing" };
      return { kind: "corrupt", text: "" };
    }
  }

  async function restoreFromBackup(backupPath: string): Promise<void> {
    await copyFileSecure(backupPath, deps.settingsFile);
  }

  async function migrateLegacy(
    parsed: Record<string, unknown>,
  ): Promise<LoadedProviderDocument> {
    const encryptionAvailable =
      deps.isAppReady() && deps.adapter.isEncryptionAvailable();
    const originals = parseV1LegacyKeys(parsed);
    const needsMigration = SECRET_PROVIDER_IDS.some((id) =>
      hasUsableSecret(originals[id]),
    );
    const nonSecret = { ...parsed };
    if (!needsMigration) {
      const secrets = emptySecrets();
      return {
        fileStatus: "ok",
        persistBlocked: false,
        encryptionAvailable,
        schemaVersion: 1,
        nonSecret,
        secrets,
        livePath: deps.settingsFile,
        backupPath: null,
        quarantinePath: null,
      };
    }

    const backupPath = path.join(
      path.dirname(deps.settingsFile),
      `provider-settings.plaintext-backup.${stamp(now())}.json`,
    );
    const copied = await copyFileSecure(deps.settingsFile, backupPath);
    if (!copied.ok) {
      return {
        fileStatus: "ok",
        persistBlocked: false,
        encryptionAvailable,
        schemaVersion: 1,
        nonSecret,
        secrets: originals,
        livePath: deps.settingsFile,
        backupPath: null,
        quarantinePath: null,
      };
    }
    await chmodProviderSettingsFile(backupPath);

    if (deps.afterBackup) {
      try {
        await deps.afterBackup();
      } catch {
        return {
          fileStatus: "ok",
          persistBlocked: false,
          encryptionAvailable,
          schemaVersion: 1,
          nonSecret,
          secrets: originals,
          livePath: deps.settingsFile,
          backupPath,
          quarantinePath: null,
        };
      }
    }

    const migrated = emptySecrets();
    for (const id of SECRET_PROVIDER_IDS) {
      const current = originals[id];
      if (current.state === "empty" || !current.plaintext) {
        migrated[id] = emptyRecord();
        continue;
      }
      migrated[id] = await encryptPlaintext(
        deps.adapter,
        encryptionAvailable,
        current.plaintext,
      );
    }

    const payload = serializeV2(nonSecret, migrated);
    const written = await writeJsonAtomicSecure(deps.settingsFile, payload, {
      failBeforeRename: deps.failBeforeRename,
    });
    if (!written.ok) {
      return {
        fileStatus: "ok",
        persistBlocked: false,
        encryptionAvailable,
        schemaVersion: 1,
        nonSecret,
        secrets: originals,
        livePath: deps.settingsFile,
        backupPath,
        quarantinePath: null,
      };
    }

    const verified = await verifyMigrated(originals, migrated);
    if (!verified) {
      await restoreFromBackup(backupPath);
      const restoredSecrets = parseV1LegacyKeys(
        JSON.parse(await fs.readFile(deps.settingsFile, "utf8")) as Record<
          string,
          unknown
        >,
      );
      return {
        fileStatus: "ok",
        persistBlocked: false,
        encryptionAvailable,
        schemaVersion: 1,
        nonSecret,
        secrets: restoredSecrets,
        livePath: deps.settingsFile,
        backupPath,
        quarantinePath: null,
      };
    }

    await fs.unlink(backupPath).catch(() => {});
    const hydrated = await hydrateSecrets(deps.adapter, migrated);
    return {
      fileStatus: "ok",
      persistBlocked: false,
      encryptionAvailable,
      schemaVersion: PROVIDER_SETTINGS_SCHEMA_VERSION,
      nonSecret,
      secrets: hydrated,
      livePath: deps.settingsFile,
      backupPath: null,
      quarantinePath: null,
    };
  }

  async function verifyMigrated(
    originals: SecretMap,
    migrated: SecretMap,
  ): Promise<boolean> {
    try {
      const text = await fs.readFile(deps.settingsFile, "utf8");
      const parsed = JSON.parse(text) as Record<string, unknown>;
      if (parsed.schemaVersion !== PROVIDER_SETTINGS_SCHEMA_VERSION) return false;
      for (const field of [
        "geminiApiKey",
        "anthropicApiKey",
        "groqApiKey",
        "openrouterApiKey",
      ] as const) {
        const value = parsed[field];
        if (typeof value === "string" && value.trim()) return false;
      }
      const diskSecrets = parseV2Secrets(parsed);
      for (const id of SECRET_PROVIDER_IDS) {
        const original = originals[id];
        if (original.state === "empty" || !original.plaintext) continue;
        const roundTrip = await decryptRecord(deps.adapter, diskSecrets[id]);
        if (roundTrip.state === "undecryptable" || !roundTrip.plaintext) {
          return false;
        }
        if (!timingEqual(roundTrip.plaintext, original.plaintext)) return false;
        if (
          migrated[id].state === "encrypted" &&
          diskSecrets[id].state !== "encrypted"
        ) {
          return false;
        }
      }
      return true;
    } catch {
      return false;
    }
  }

  async function loadUncached(): Promise<LoadedProviderDocument> {
    const encryptionAvailable =
      deps.isAppReady() && deps.adapter.isEncryptionAvailable();
    const read = await readLiveFile();
    if (read.kind === "missing") {
      return {
        fileStatus: "missing",
        persistBlocked: false,
        encryptionAvailable,
        schemaVersion: null,
        nonSecret: {},
        secrets: emptySecrets(),
        livePath: deps.settingsFile,
        backupPath: null,
        quarantinePath: null,
      };
    }
    if (read.kind === "corrupt") {
      const quarantinePath = await quarantineCorrupt(read.text);
      return {
        fileStatus: "quarantined",
        persistBlocked: false,
        encryptionAvailable,
        schemaVersion: null,
        nonSecret: {},
        secrets: emptySecrets(),
        livePath: deps.settingsFile,
        backupPath: null,
        quarantinePath,
      };
    }

    const schemaVersion =
      typeof read.parsed.schemaVersion === "number"
        ? read.parsed.schemaVersion
        : null;
    if (
      schemaVersion != null &&
      schemaVersion > PROVIDER_SETTINGS_SCHEMA_VERSION
    ) {
      return {
        fileStatus: "unsupported_schema",
        persistBlocked: true,
        encryptionAvailable,
        schemaVersion,
        nonSecret: read.parsed,
        secrets: emptySecrets(),
        livePath: deps.settingsFile,
        backupPath: null,
        quarantinePath: null,
      };
    }

    if (schemaVersion === PROVIDER_SETTINGS_SCHEMA_VERSION) {
      const secrets = await hydrateSecrets(
        deps.adapter,
        parseV2Secrets(read.parsed),
      );
      return {
        fileStatus: "ok",
        persistBlocked: false,
        encryptionAvailable,
        schemaVersion,
        nonSecret: read.parsed,
        secrets,
        livePath: deps.settingsFile,
        backupPath: null,
        quarantinePath: null,
      };
    }

    return migrateLegacy(read.parsed);
  }

  async function load(): Promise<LoadedProviderDocument> {
    return runSerialized(async () => {
      cached = await loadUncached();
      return cached;
    });
  }

  return {
    ensureMigrated: load,
    load,
    async persist(nonSecret, secrets) {
      return runSerialized(async () => {
        if (cached?.persistBlocked) {
          throw new Error(PROVIDER_SECRET_STATUS_MESSAGES.unsupportedSchema);
        }
        const encryptionAvailable =
          deps.isAppReady() && deps.adapter.isEncryptionAvailable();
        const payload = serializeV2(nonSecret, secrets);
        const written = await writeJsonAtomicSecure(deps.settingsFile, payload, {
          failBeforeRename: deps.failBeforeRename,
        });
        if (!written.ok) {
          throw new Error("Could not save provider settings.");
        }
        const hydrated = await hydrateSecrets(deps.adapter, secrets);
        cached = {
          fileStatus: "ok",
          persistBlocked: false,
          encryptionAvailable,
          schemaVersion: PROVIDER_SETTINGS_SCHEMA_VERSION,
          nonSecret,
          secrets: hydrated,
          livePath: deps.settingsFile,
          backupPath: null,
          quarantinePath: null,
        };
        return cached;
      });
    },
    async getDecryptedApiKey(provider) {
      const doc = cached ?? (await load());
      const record = doc.secrets[provider];
      if (!record || record.state === "empty" || record.state === "undecryptable") {
        return null;
      }
      if (record.plaintext && record.plaintext.trim()) return record.plaintext;
      if (record.state === "encrypted") {
        const decrypted = await decryptRecord(deps.adapter, record);
        return decrypted.plaintext?.trim() ? decrypted.plaintext : null;
      }
      return null;
    },
    statusFrom: statusFromDocument,
    encryptOrLegacy(plain) {
      const encryptionAvailable =
        deps.isAppReady() && deps.adapter.isEncryptionAvailable();
      return encryptPlaintext(deps.adapter, encryptionAvailable, plain);
    },
  };
}

export function secretHasStoredKey(record: SecretRecord): boolean {
  return record.state !== "empty";
}

export async function listSiblingArtifacts(
  settingsFile: string,
): Promise<string[]> {
  const dir = path.dirname(settingsFile);
  const names = await fs.readdir(dir);
  return names
    .filter(
      (name) =>
        name.startsWith("provider-settings.plaintext-backup.") ||
        name.startsWith("provider-settings.quarantine."),
    )
    .map((name) => path.join(dir, name));
}

