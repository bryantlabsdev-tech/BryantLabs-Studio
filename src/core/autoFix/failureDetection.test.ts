import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  collectVerificationFailures,
  pickPrimaryFailure,
} from "@/core/autoFix/failureDetection";
import type { VerificationResult } from "@/types";

function failedVerification(stderr: string): VerificationResult {
  return {
    ranAt: Date.now(),
    typecheck: {
      command: "npx tsc --noEmit",
      ok: false,
      exitCode: 1,
      stdout: "",
      stderr,
      durationMs: 100,
      errorCount: 1,
      warningCount: 0,
      timedOut: false,
      truncated: false,
    },
    build: {
      command: "npm run build",
      ok: true,
      exitCode: 0,
      stdout: "",
      stderr: "",
      durationMs: 100,
      errorCount: 0,
      warningCount: 0,
      timedOut: false,
      truncated: false,
    },
  };
}

describe("collectVerificationFailures", () => {
  it("captures TS2304 cannot find name as import-related", () => {
    const stderr =
      "src/App.tsx(12,5): error TS2304: Cannot find name 'useState'.";
    const failures = collectVerificationFailures(failedVerification(stderr));
    assert.ok(failures.length >= 1);
    const primary = pickPrimaryFailure(failures);
    assert.ok(primary);
    assert.match(primary!.message, /useState/i);
    assert.equal(primary!.kind, "import");
    assert.equal(primary!.line, 12);
  });
});
