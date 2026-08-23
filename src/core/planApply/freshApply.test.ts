import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { decideFreshApplyWrite } from "@/core/planApply/freshApply";

describe("decideFreshApplyWrite", () => {
  it("skips when the live file already matches the proposal", () => {
    const decision = decideFreshApplyWrite({
      basisContent: "old css",
      applyContent: "new css",
      freshContent: "new css",
    });
    assert.equal(decision.kind, "already-applied");
  });

  it("writes against the original basis when disk is unchanged", () => {
    const decision = decideFreshApplyWrite({
      basisContent: "export function App() { return null; }",
      applyContent: "export function App() { return <div />; }",
      freshContent: "export function App() { return null; }",
    });
    assert.equal(decision.kind, "write");
    if (decision.kind === "write") {
      assert.equal(decision.basis, "export function App() { return null; }");
    }
  });

  it("writes against live disk when the file changed under the proposal", () => {
    const decision = decideFreshApplyWrite({
      basisContent: "old",
      applyContent: "hello world",
      freshContent: "hello  world",
    });
    assert.equal(decision.kind, "write");
    if (decision.kind === "write") {
      assert.equal(decision.basis, "hello  world");
    }
  });
});
