import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { hydrateApplyPlanBatchFiles } from "./applyPlanBatchHydrate.cjs";

describe("apply plan batch path hydration", () => {
  it("reads target contents from absPath when content is empty", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bryantlabs-hydrate-"));
    try {
      const absPath = path.join(dir, "Tasks.tsx");
      const body = "export default function Tasks() { return null; }\n";
      fs.writeFileSync(absPath, body, "utf8");
      const result = hydrateApplyPlanBatchFiles([
        { path: "src/pages/Tasks.tsx", content: "", absPath },
      ]);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.files[0]?.content, body);
      assert.equal(result.files[0]?.path, "src/pages/Tasks.tsx");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("hydrates eight metadata-only files from a disposable temp workspace", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bryantlabs-hydrate-8-"));
    try {
      const files = Array.from({ length: 8 }, (_, i) => {
        const rel = `src/f${i}.tsx`;
        const absPath = path.join(dir, `f${i}.tsx`);
        fs.writeFileSync(absPath, `export const n${i} = ${i};\n`, "utf8");
        return { path: rel, content: "", absPath };
      });
      const result = hydrateApplyPlanBatchFiles(files);
      assert.equal(result.ok, true);
      if (!result.ok) return;
      assert.equal(result.files.length, 8);
      assert.equal(result.files[7]?.content, "export const n7 = 7;\n");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("keeps empty content for create targets without absPath", () => {
    const result = hydrateApplyPlanBatchFiles([
      { path: "src/NewFile.tsx", content: "" },
    ]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.files[0]?.content, "");
  });
});
