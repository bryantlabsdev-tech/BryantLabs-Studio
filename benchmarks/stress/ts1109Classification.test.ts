import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  classifyTs1109,
  ts1109RepairLabel,
} from "./ts1109Classification.ts";

describe("ts1109Classification", () => {
  it("detects truncated array literals", () => {
    assert.equal(classifyTs1109('  { id:...'), "truncated_literal");
    assert.match(ts1109RepairLabel("truncated_literal"), /truncated/i);
  });

  it("detects leaked marker lines", () => {
    assert.equal(classifyTs1109("@@END:src/pages/Foo.tsx@@"), "marker_artifact");
  });

  it("returns unknown for generic syntax errors", () => {
    assert.equal(classifyTs1109("export default function X() {"), "unknown");
  });
});
