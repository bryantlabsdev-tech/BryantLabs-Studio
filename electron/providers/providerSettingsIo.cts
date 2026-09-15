import { promises as fs } from "node:fs";
import * as path from "node:path";

export const PROVIDER_SETTINGS_FILE_MODE = 0o600;

export interface ProviderSettingsWriteResult {
  readonly ok: boolean;
  readonly reason?: string;
}

function errMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export async function chmodProviderSettingsFile(absPath: string): Promise<void> {
  await fs.chmod(absPath, PROVIDER_SETTINGS_FILE_MODE);
}

async function syncDirectory(dir: string): Promise<void> {
  try {
    const handle = await fs.open(dir, "r");
    try {
      await handle.sync();
    } finally {
      await handle.close();
    }
  } catch {
    // Directory fsync is unsupported on some platforms; the renamed file remains.
  }
}

export async function writeUtf8AtomicSecure(
  absPath: string,
  contents: string,
  opts?: { failBeforeRename?: boolean },
): Promise<ProviderSettingsWriteResult> {
  const parent = path.dirname(absPath);
  await fs.mkdir(parent, { recursive: true });
  const tmp = path.join(
    parent,
    `.${path.basename(absPath)}.tmp.${process.pid}.${Date.now()}`,
  );
  try {
    const handle = await fs.open(tmp, "w", PROVIDER_SETTINGS_FILE_MODE);
    try {
      await handle.writeFile(contents, "utf8");
      await handle.sync();
    } finally {
      await handle.close();
    }
    await chmodProviderSettingsFile(tmp);
    if (opts?.failBeforeRename) {
      await fs.unlink(tmp).catch(() => {});
      return { ok: false, reason: "Write could not be completed." };
    }
    await fs.rename(tmp, absPath);
    await chmodProviderSettingsFile(absPath);
    await syncDirectory(parent);
    return { ok: true };
  } catch (err) {
    await fs.unlink(tmp).catch(() => {});
    return { ok: false, reason: errMessage(err, "Write could not be completed.") };
  }
}

export async function writeJsonAtomicSecure(
  absPath: string,
  data: unknown,
  opts?: { failBeforeRename?: boolean },
): Promise<ProviderSettingsWriteResult> {
  const payload = `${JSON.stringify(data, null, 2)}\n`;
  return writeUtf8AtomicSecure(absPath, payload, opts);
}

export async function copyFileSecure(
  from: string,
  to: string,
): Promise<ProviderSettingsWriteResult> {
  try {
    const parent = path.dirname(to);
    await fs.mkdir(parent, { recursive: true });
    await fs.copyFile(from, to);
    await chmodProviderSettingsFile(to);
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: errMessage(err, "Could not copy settings file.") };
  }
}

export function posixFileMode(statMode: number): number {
  return statMode & 0o777;
}
