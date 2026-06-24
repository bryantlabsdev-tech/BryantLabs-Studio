import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  applySimpleUnifiedDiff,
  isRepairParseError,
  parseGreenfieldRepairContent,
  stripMarkdownCodeFence,
} from "@/core/greenfield/repairParse";

const SAMPLE_APP = `import { useState } from "react";

export default function App() {
  const [value, setValue] = useState<number | null>(null);
  return <div>{value}</div>;
}
`;

describe("repairParse", () => {
  it("accepts @@FILE block for target path", () => {
    const raw = `@@FILE:src/App.tsx@@
${SAMPLE_APP}
@@END:src/App.tsx@@`;
    const parsed = parseGreenfieldRepairContent(raw, "src/App.tsx");
    assert.ok(parsed);
    assert.match(parsed!, /export default function App/);
  });

  it("accepts single-file markdown code fence", () => {
    const raw = "```tsx\n" + SAMPLE_APP + "\n```";
    const parsed = parseGreenfieldRepairContent(raw, "src/App.tsx");
    assert.ok(parsed);
    assert.equal(stripMarkdownCodeFence(raw), SAMPLE_APP);
  });

  it("accepts @@PATCHED_FILE markers", () => {
    const raw = `@@PATCHED_FILE_START@@
${SAMPLE_APP}
@@PATCHED_FILE_END@@`;
    const parsed = parseGreenfieldRepairContent(raw, "src/App.tsx");
    assert.ok(parsed);
  });

  it("accepts unified diff when original content is provided", () => {
    const original = "line1\nline2\nline3\n";
    const diff = [
      "--- a/src/App.tsx",
      "+++ b/src/App.tsx",
      "@@ -2,1 +2,1 @@",
      " line2",
      "-line3",
      "+line3-fixed",
    ].join("\n");
    const parsed = parseGreenfieldRepairContent(diff, "src/App.tsx", original);
    assert.ok(parsed);
    assert.match(parsed!, /line3-fixed/);
  });

  it("detects repair parse errors", () => {
    assert.equal(
      isRepairParseError("Could not find repaired file content in the AI response."),
      true,
    );
    assert.equal(isRepairParseError("Repair model returned an invalid format."), true);
    assert.equal(isRepairParseError("TypeScript check failed"), false);
  });

  it("falls back to single marker block when only one file is returned", () => {
    const raw = `@@FILE:src/App.tsx@@
${SAMPLE_APP}
@@END@@`;
    const parsed = parseGreenfieldRepairContent(raw, "src/App.tsx");
    assert.ok(parsed);
  });
});

describe("applySimpleUnifiedDiff", () => {
  it("applies a single hunk replacement", () => {
    const original = "alpha\nbeta\ngamma\n";
    const diff = [
      "--- a/file",
      "+++ b/file",
      "@@ -2,1 +2,1 @@",
      " beta",
      "-gamma",
      "+gamma-fixed",
    ].join("\n");
    const next = applySimpleUnifiedDiff(original, diff);
    assert.ok(next);
    assert.match(next!, /gamma-fixed/);
  });
});
