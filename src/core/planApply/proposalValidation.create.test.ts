import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { validateCreateProposalQuality } from "@/core/planApply/proposalValidation";

describe("validateCreateProposalQuality", () => {
  it("accepts non-empty new component content", () => {
    const content = `export function History() {
  return <section>History</section>;
}
`;
    const result = validateCreateProposalQuality(content, "src/components/History.tsx");
    assert.equal(result.ok, true);
  });

  it("rejects empty new file content", () => {
    const result = validateCreateProposalQuality("   ", "src/components/History.tsx");
    assert.equal(result.ok, false);
  });
});
