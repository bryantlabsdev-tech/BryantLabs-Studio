import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  MACOS_PATH_FALLBACK,
  buildSafePath,
  formatPosixSpawnError,
  formatNpmInstallFailureMessage,
  isNpmEnoentOutput,
  resolveShellCommand,
} from "./processSpawn.cjs";

describe("processSpawn", () => {
  it("buildSafePath includes macOS fallbacks", () => {
    if (process.platform !== "darwin") return;
    const safe = buildSafePath("/usr/bin");
    assert.ok(safe.includes("/opt/homebrew/bin"));
    assert.ok(safe.includes("/usr/local/bin"));
    assert.ok(safe.includes("/usr/bin"));
    assert.equal(MACOS_PATH_FALLBACK.includes("/opt/homebrew/bin"), true);
  });

  it("buildSafePath preserves existing entries", () => {
    const safe = buildSafePath("/custom/bin");
    assert.ok(safe.startsWith("/custom/bin"));
  });

  it("formatPosixSpawnError maps posix_spawnp failures", () => {
    assert.equal(
      formatPosixSpawnError(new Error("posix_spawnp failed")),
      "Could not start shell/process. Check PATH and command path.",
    );
  });

  it("isNpmEnoentOutput detects npm ENOENT", () => {
    assert.equal(
      isNpmEnoentOutput("", "npm error code ENOENT"),
      true,
    );
  });

  it("formatNpmInstallFailureMessage covers ENOENT", () => {
    assert.equal(
      formatNpmInstallFailureMessage({
        cwd: "/tmp/missing-project",
        stderr: "spawn npm ENOENT",
      }),
      "npm command not found or project folder missing package.json.",
    );
  });

  it("resolveShellCommand rewrites npm on darwin", () => {
    if (process.platform !== "darwin") return;
    const resolved = resolveShellCommand("npm install");
    assert.ok(resolved.endsWith(" install"));
    if (resolved.startsWith("/")) {
      assert.match(resolved, /^\/(opt\/homebrew|usr\/local)\/bin\/npm install$/);
    }
  });
});
