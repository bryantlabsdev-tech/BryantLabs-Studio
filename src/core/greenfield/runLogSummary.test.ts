import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createRunLogEntry,
  deriveRunDurationMsFromLog,
  deriveVerificationFromRunLog,
  isGreenfieldPipelineLog,
} from "@/core/greenfield/runLog";

describe("run log summary derivation", () => {
  it("detects greenfield pipeline entries", () => {
    const entries = [
      createRunLogEntry("generation", "success", "Generation started"),
      createRunLogEntry(
        "ai_call",
        "success",
        "greenfield · gemini",
        "stage=greenfield · provider=gemini",
      ),
    ];
    assert.equal(isGreenfieldPipelineLog(entries), true);
  });

  it("derives verification results from terminal log stages", () => {
    const entries = [
      createRunLogEntry(
        "npm_install",
        "success",
        "npm install finished",
        "npm install · exit 0 · ok · 8053ms",
      ),
      createRunLogEntry(
        "typescript",
        "success",
        "TypeScript check finished",
        "npx tsc --noEmit · exit 0 · ok · 1282ms",
      ),
      createRunLogEntry(
        "typescript",
        "success",
        "TypeScript passed after UI repair",
        "npx tsc --noEmit · exit 0 · ok · 900ms",
      ),
      createRunLogEntry(
        "build",
        "success",
        "Build passed after UI repair",
        "npm run build · exit 0 · ok · 1573ms",
      ),
      createRunLogEntry("preview", "success", "Preview restarted"),
    ];

    const derived = deriveVerificationFromRunLog(entries);
    assert.equal(derived.typescriptResult, "passed");
    assert.equal(derived.buildResult, "passed");
    assert.equal(derived.commandsRun.length, 3);
    assert.match(derived.previewResult ?? "", /success: Preview restarted/);
  });

  it("derives duration from runStartedAt and final log timestamp", () => {
    const runStartedAt = Date.parse("2026-06-20T22:56:21.509Z");
    const entries = [
      createRunLogEntry("prompt", "success", "Prompt submitted"),
    ];
    entries[0] = {
      ...entries[0]!,
      timestamp: "2026-06-20T22:57:36.676Z",
    };

    const duration = deriveRunDurationMsFromLog(runStartedAt, entries);
    assert.ok(duration != null && duration >= 75_000);
  });
});
