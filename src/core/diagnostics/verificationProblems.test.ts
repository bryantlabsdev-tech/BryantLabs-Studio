import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveVerificationProblems } from "@/core/diagnostics/verificationProblems";
import type { VerificationResult } from "@/types";

describe("deriveVerificationProblems", () => {
  it("parses TypeScript error lines", () => {
    const verification: VerificationResult = {
      ranAt: Date.now(),
      typecheck: {
        command: "npx tsc --noEmit",
        ok: false,
        exitCode: 2,
        stdout: "",
        stderr: "src/App.tsx(12,5): error TS2304: Cannot find name 'Foo'.",
        durationMs: 10,
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
        durationMs: 10,
        errorCount: 0,
        warningCount: 0,
        timedOut: false,
        truncated: false,
      },
    };

    const problems = deriveVerificationProblems(verification);
    assert.equal(problems.length, 1);
    assert.equal(problems[0]?.file, "src/App.tsx");
    assert.equal(problems[0]?.line, 12);
    assert.match(problems[0]?.message ?? "", /Cannot find name/);
  });
});
