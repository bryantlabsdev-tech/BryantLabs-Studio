import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { alignUseStateWithRelaxedMock } from "@/core/typescript/intersectionTypeRepair";

describe("alignUseStateWithRelaxedMock", () => {
  it("drops strict generic when mock array was relaxed", () => {
    const source = [
      "const mockHearings: Array<Record<string, unknown>> = [];",
      "const [hearings] = useState<Hearing[]>(mockHearings);",
    ].join("\n");
    const fixed = alignUseStateWithRelaxedMock(source);
    assert.ok(fixed);
    assert.match(fixed!, /useState\(mockHearings as unknown as Hearing\[\]\)/);
    assert.doesNotMatch(fixed!, /useState<Hearing\[\]>/);
  });
});
