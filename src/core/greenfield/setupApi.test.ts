import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isGreenfieldSetupTransportError } from "@/core/greenfield/setupApi";
import type { GreenfieldSetupResult } from "@/core/greenfield/types";

describe("isGreenfieldSetupTransportError", () => {
  it("detects IPC transport failures without install payload", () => {
    assert.equal(
      isGreenfieldSetupTransportError({ error: "Invalid project path." }),
      true,
    );
  });

  it("does not treat partial setup failures as transport errors", () => {
    const setup: GreenfieldSetupResult = {
      ok: false,
      install: {
        command: "npm install",
        ok: true,
        exitCode: 0,
        stdout: "",
        stderr: "",
        durationMs: 1,
        errorCount: 0,
        warningCount: 0,
        timedOut: false,
        truncated: false,
      },
      typecheck: {
        command: "npx tsc --noEmit",
        ok: false,
        exitCode: 2,
        stdout: "",
        stderr: "error TS2304",
        durationMs: 1,
        errorCount: 1,
        warningCount: 0,
        timedOut: false,
        truncated: false,
      },
      error: "TypeScript check failed (1 error).",
    };
    assert.equal(isGreenfieldSetupTransportError(setup), false);
  });
});
