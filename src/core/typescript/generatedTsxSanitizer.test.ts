import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  prefixUnusedUseStateSetters,
  sanitizeGeneratedTsxSource,
} from "@/core/typescript/generatedTsxSanitizer";

describe("generatedTsxSanitizer", () => {
  it("prefixes unused useState setters", () => {
    const source = [
      "import { useState } from 'react';",
      "export default function Estimates() {",
      "  const [estimates, setEstimates] = useState([]);",
      "  return <div>{estimates.length}</div>;",
      "}",
    ].join("\n");
    const next = prefixUnusedUseStateSetters(source);
    assert.ok(next);
    assert.match(next!, /\[estimates, _setEstimates\]/);
  });

  it("sanitizes React import and unused setters together", () => {
    const source = [
      "import React from 'react';",
      "export default function Invoices() {",
      "  const [invoices, setInvoices] = useState([]);",
      "  return <div>{invoices.length}</div>;",
      "}",
    ].join("\n");
    const next = sanitizeGeneratedTsxSource(source);
    assert.ok(next);
    assert.match(next!, /import \{ useState \}/);
    assert.match(next!, /_setInvoices/);
  });
});
