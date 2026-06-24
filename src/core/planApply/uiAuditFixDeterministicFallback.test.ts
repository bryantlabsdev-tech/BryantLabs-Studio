import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildUiAuditAdvisoryFixPrompt,
  parseUiAuditAdvisoryFixPrompt,
  recommendationsForUiAuditIssues,
} from "@/core/agent/uiAuditAdvisoryUx";
import { buildUiAuditFixDeterministicPatches } from "@/core/planApply/uiAuditFixDeterministicFallback";

const SAMPLE_CSS = `:root {
  color: #111;
}

.table-container {
  width: 100%;
}
`;

describe("uiAuditFixDeterministicFallback", () => {
  const prompt = buildUiAuditAdvisoryFixPrompt({
    layoutType: "table_layout",
    score: 86,
    issues: ["rows_overflow"],
    recommendations: recommendationsForUiAuditIssues(["rows_overflow"]),
  });

  it("parses UI audit advisory fix prompts", () => {
    const parsed = parseUiAuditAdvisoryFixPrompt(prompt);
    assert.ok(parsed);
    assert.equal(parsed?.layoutType, "table_layout");
    assert.deepEqual(parsed?.issues, ["rows_overflow"]);
    assert.ok(parsed!.recommendations.length > 0);
  });

  it("builds deterministic patches for App.tsx and index.css when provider unavailable", () => {
    const result = buildUiAuditFixDeterministicPatches({
      prompt,
      appTsx: "export default function App() { return <div className=\"table-container\" />; }",
      indexCss: SAMPLE_CSS,
    });
    assert.ok(result?.ok, "expected deterministic fallback");
    assert.ok(result?.files["src/index.css"]);
    assert.match(result?.files["src/index.css"] ?? "", /overflow-x:\s*auto/i);
    assert.ok(Object.keys(result?.files ?? {}).length >= 1);
    assert.match(result?.plan ?? "", /Deterministic UI audit fix/i);
  });

  it("returns null without index.css source", () => {
    const result = buildUiAuditFixDeterministicPatches({
      prompt,
      appTsx: "export default function App() { return null; }",
      indexCss: null,
    });
    assert.equal(result, null);
  });
});
