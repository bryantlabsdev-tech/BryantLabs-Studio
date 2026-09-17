import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { isStudioTestCaptureEnabled } from "@/core/agent/studioTestCapture";
import { getLastConsultationPrompt, recordLastConsultationPrompt } from "@/core/agent/agentConsultation";

describe("studio test capture gating", () => {
  it("does not capture consultation prompts in node unit tests without Vite E2E env", () => {
    assert.equal(isStudioTestCaptureEnabled(), false);
    recordLastConsultationPrompt("SECRET_PROVIDER_PROMPT");
    assert.equal(getLastConsultationPrompt(), "");
  });

  it("keeps consultation prompt capture and window hooks behind test-mode guards in source", () => {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
    const hooks = readFileSync(path.join(root, "src/app/workspace/useStudioTestHooks.ts"), "utf8");
    const consult = readFileSync(path.join(root, "src/core/agent/agentConsultation.ts"), "utf8");
    assert.match(hooks, /if \(!isStudioTestMode\(\)\) return;/);
    assert.match(consult, /isStudioTestCaptureEnabled\(\)/);
    assert.match(consult, /if \(!isStudioTestCaptureEnabled\(\)\) return "";/);
  });
});
