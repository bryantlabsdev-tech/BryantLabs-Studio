import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildIconStubModule } from "@/core/typescript/iconLibraryRepair";

describe("iconLibraryRepair props", () => {
  it("accepts size, strokeWidth, and className on IconStub", () => {
    const stub = buildIconStubModule(["Search"]);
    assert.match(stub, /size\?: number \| string/);
    assert.match(stub, /strokeWidth\?: number/);
    assert.match(stub, /className\?: string/);
    assert.match(stub, /className\?: string/);
  });
});
