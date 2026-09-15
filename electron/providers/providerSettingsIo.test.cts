import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  posixFileMode,
  writeJsonAtomicSecure,
  writeUtf8AtomicSecure,
} from "./providerSettingsIo.cjs";

describe("provider settings durable writes", () => {
  it("flushes, renames, and applies mode 0600 on POSIX", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-provider-io-"));
    const target = path.join(dir, "provider-settings.json");
    const written = await writeJsonAtomicSecure(target, { ok: true });
    assert.equal(written.ok, true);
    const stat = await fs.stat(target);
    if (process.platform !== "win32") {
      assert.equal(posixFileMode(stat.mode), 0o600);
    }
    const parsed = JSON.parse(await fs.readFile(target, "utf8")) as { ok: boolean };
    assert.equal(parsed.ok, true);
  });

  it("leaves the original file in place when rename is skipped", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "bl-provider-io-fail-"));
    const target = path.join(dir, "provider-settings.json");
    await fs.writeFile(target, '{"keep":true}\n', "utf8");
    const failed = await writeUtf8AtomicSecure(target, '{"next":true}\n', {
      failBeforeRename: true,
    });
    assert.equal(failed.ok, false);
    const text = await fs.readFile(target, "utf8");
    assert.equal(text.includes("keep"), true);
    assert.equal(text.includes("next"), false);
  });
});
