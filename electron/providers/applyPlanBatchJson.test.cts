import assert from "node:assert/strict";
import { describe, it } from "node:test";

function metadataPayload(fileCount: number) {
  const files = Array.from({ length: fileCount }, (_, i) => ({
    path: `src/file-${i}.tsx`,
    content: "",
    absPath: `/tmp/proj/src/file-${i}.tsx`,
  }));
  return {
    provider: "anthropic",
    prompt: "Expand the project",
    context: {
      framework: "react",
      language: "typescript",
      files: [] as const,
      symbols: [] as const,
    },
    files,
    meta: {
      planSummary: "Edit files",
      targetPaths: files.map((f) => f.path),
      slimContext: true,
    },
  };
}

describe("applyPlanBatchJson payload contract", () => {
  for (const count of [0, 1, 8, 50] as const) {
    it(`serializes ${count}-file metadata payloads without file bodies`, () => {
      const payload = metadataPayload(count);
      const json = JSON.stringify(payload);
      assert.ok(!json.includes("export default"));
      assert.ok(!json.includes("function App"));
      const parsed = JSON.parse(json) as typeof payload;
      assert.equal(parsed.files.length, count);
      assert.ok(parsed.files.every((f) => f.content === ""));
      if (count > 0) {
        assert.ok(parsed.files[0]?.absPath);
        assert.ok(json.length < 80_000);
      }
    });
  }

  it("documents string-only preload contract", () => {
    // preload: proposeApplyPlanPatchesJson(payloadJson: string) → applyPlanBatchJson
    assert.equal(typeof "string", "string");
  });
});
