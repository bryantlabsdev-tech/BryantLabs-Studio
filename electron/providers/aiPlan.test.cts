import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildPlanJsonRepairPrompt,
  buildPlanSchemaRepairPrompt,
  detectJsonTruncation,
  enforcePlanSchemaKeys,
  extractJsonObject,
  normalizeModelText,
  parseAIPlan,
  repairJsonText,
} from "./aiPlan.cjs";

const VALID_PLAN = {
  summary: "Add dark mode toggle to settings.",
  files: [{ path: "src/App.tsx", reason: "Root layout" }],
  reasoning: "Theme state lives in the app shell.",
  risks: ["May affect global CSS variables"],
  confidence: "High",
};

describe("normalizeModelText", () => {
  it("strips markdown json fences", () => {
    const raw = "```json\n" + JSON.stringify(VALID_PLAN) + "\n```";
    assert.equal(normalizeModelText(raw), JSON.stringify(VALID_PLAN));
  });
});

describe("buildPlanJsonRepairPrompt", () => {
  it("asks for JSON only with no markdown", () => {
    const prompt = buildPlanJsonRepairPrompt("Here is my analysis...");
    assert.match(prompt, /Convert the previous response into valid JSON only/i);
    assert.match(prompt, /Return no markdown/i);
    assert.match(prompt, /Here is my analysis/);
  });
});

describe("buildPlanSchemaRepairPrompt", () => {
  it("includes schema repair instructions", () => {
    const prompt = buildPlanSchemaRepairPrompt('{"summary":"x"}');
    assert.match(prompt, /valid JSON/i);
  });
});

describe("parseAIPlan", () => {
  it("parses bare JSON", () => {
    const result = parseAIPlan(JSON.stringify(VALID_PLAN));
    assert.equal(result.ok, true);
    if (result.ok) assert.equal(result.plan.summary, VALID_PLAN.summary);
  });

  it("extracts JSON from leading prose", () => {
    const result = parseAIPlan(
      `Here is the plan:\n${JSON.stringify(VALID_PLAN)}\nThanks.`,
    );
    assert.equal(result.ok, true);
  });

  it("repairs trailing commas", () => {
    const broken = `{
      "summary": "Test",
      "files": [],
      "reasoning": "x",
      "risks": [],
      "confidence": "Low",
    }`;
    const result = parseAIPlan(broken);
    assert.equal(result.ok, true);
  });

  it("classifies missing root keys as schema_validation", () => {
    const result = parseAIPlan(JSON.stringify({ summary: "only summary" }));
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.parseFailReason, "schema_validation");
      assert.equal(result.error, "Schema Validation Failed");
      assert.match(result.parseError, /Missing required root keys/i);
    }
  });

  it("fails when summary is empty", () => {
    const result = parseAIPlan(
      JSON.stringify({ ...VALID_PLAN, summary: "   " }),
    );
    assert.equal(result.ok, false);
    if (!result.ok) assert.match(result.parseError, /summary/i);
  });

  it("classifies truncated JSON as Response Truncated", () => {
    const cut = `{
  "summary": "Implement resizable panels in the layout",
  "files": [`;
    const result = parseAIPlan(cut);
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error, "Response Truncated");
      assert.equal(result.parseFailReason, "truncated");
      assert.equal(result.truncationDetected, true);
      assert.match(result.parseError, /stopped before completing/i);
    }
  });
});

describe("enforcePlanSchemaKeys", () => {
  it("requires all root keys", () => {
    const check = enforcePlanSchemaKeys({ summary: "x" });
    assert.equal(check.ok, false);
    if (!check.ok) {
      assert.ok(check.missing.includes("files"));
      assert.ok(check.missing.includes("confidence"));
    }
  });
});

describe("detectJsonTruncation", () => {
  it("detects unclosed string", () => {
    const d = detectJsonTruncation('{"summary": "hello');
    assert.equal(d.truncated, true);
    assert.equal(d.kind, "unclosed_string");
  });
});

describe("extractJsonObject", () => {
  it("returns first balanced object", () => {
    const json = extractJsonObject(`noise {"a":1} tail`);
    assert.equal(json, '{"a":1}');
  });
});

describe("repairJsonText", () => {
  it("removes trailing comma before closing brace", () => {
    assert.equal(repairJsonText('{"a":1,}'), '{"a":1}');
  });
});
