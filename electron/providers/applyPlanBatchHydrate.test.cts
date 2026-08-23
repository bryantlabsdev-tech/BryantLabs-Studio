import assert from "node:assert/strict";
import { describe, it } from "node:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Regression: Apply Plan batch IPC must not require full file contents in the
 * invoke payload. Main hydrates from absPath so large structured clones cannot
 * hang Electron before providers:applyPlanBatch runs.
 */
describe("apply plan batch path hydration contract", () => {
  it("can read target contents from absPath when content is empty", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "bryantlabs-hydrate-"));
    const absPath = path.join(dir, "Tasks.tsx");
    const body = "export default function Tasks() { return null; }\n";
    fs.writeFileSync(absPath, body, "utf8");
    const payload = [{ path: "src/pages/Tasks.tsx", content: "", absPath }];
    const hydrated = payload.map((f) => ({
      path: f.path,
      content:
        f.content && f.content.length > 0
          ? f.content
          : fs.readFileSync(f.absPath, "utf8"),
    }));
    assert.equal(hydrated[0]?.content, body);
    fs.rmSync(dir, { recursive: true, force: true });
  });
});
