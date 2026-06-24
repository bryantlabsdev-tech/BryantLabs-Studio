import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildUiAuditAdvisoryFixPrompt } from "@/core/agent/uiAuditAdvisoryUx";
import { generatePlan } from "@/core/planner";
import {
  buildBlockedPlannerResult,
  buildPlannerPreflightDiagnostics,
  canUseDeterministicPlanWithoutProviderCall,
  formatPlannerPreflightDiagnostics,
  parsePlannerPreflightFromLogDetails,
  preflightGateUserMessage,
  readPreflightGate,
} from "@/core/planner/plannerPreflight";
import { mockProjectScan } from "@/core/repository/testScan";

describe("plannerPreflight", () => {
  it("marks ui audit fix prompts as fallback eligible when plan has files", () => {
    const scan = mockProjectScan(["src/App.tsx", "src/index.css"]);
    const prompt = buildUiAuditAdvisoryFixPrompt({
      layoutType: "table_layout",
      score: 86,
      issues: ["rows_overflow"],
      recommendations: ["Enable horizontal scrolling on comparison tables under 768px."],
    });
    const plan = generatePlan(prompt, scan);
    assert.equal(canUseDeterministicPlanWithoutProviderCall(prompt, plan), true);
  });

  it("maps blocked provider results to readable gate messages", () => {
    const blocked = buildBlockedPlannerResult({
      gate: "provider_not_connected",
      message: "No gemini API key is stored. Add one in settings.",
      provider: "gemini",
      model: "gemini-2.5-flash",
      preflight: buildPlannerPreflightDiagnostics({
        userPrompt: "Fix UI",
        plan: null,
        gate: "provider_not_connected",
        providerCallAttempted: false,
        skipReason: "No gemini API key is stored. Add one in settings.",
      }),
    });
    assert.equal(readPreflightGate(blocked), "provider_not_connected");
    assert.match(
      preflightGateUserMessage("provider_not_connected", blocked.error),
      /not connected|API key/i,
    );
  });

  it("rejects deterministic fallback for non edit_follow_up routes", () => {
    const scan = mockProjectScan(["src/App.tsx", "src/index.css"]);
    const prompt = buildUiAuditAdvisoryFixPrompt({
      layoutType: "table_layout",
      score: 86,
      issues: ["rows_overflow"],
      recommendations: ["Enable horizontal scrolling on comparison tables under 768px."],
    });
    const plan = generatePlan(prompt, scan);
    assert.equal(canUseDeterministicPlanWithoutProviderCall(prompt, plan, "pipeline"), false);
    assert.equal(canUseDeterministicPlanWithoutProviderCall(prompt, plan, "edit_follow_up"), true);
  });

  it("round-trips preflight diagnostics through log detail formatting", () => {
    const preflight = buildPlannerPreflightDiagnostics({
      userPrompt: "Fix UI",
      plan: null,
      route: "edit_follow_up",
      gate: "provider_not_connected",
      providerCallAttempted: false,
      providerBlockedReason: "No gemini API key is stored. Add one in settings.",
      fallbackAttempted: true,
      fallbackUsed: false,
    });
    const parsed = parsePlannerPreflightFromLogDetails(
      formatPlannerPreflightDiagnostics(preflight),
    );
    assert.equal(parsed?.gate, "provider_not_connected");
    assert.equal(parsed?.fallbackAttempted, true);
    assert.equal(parsed?.fallbackUsed, false);
  });
});
