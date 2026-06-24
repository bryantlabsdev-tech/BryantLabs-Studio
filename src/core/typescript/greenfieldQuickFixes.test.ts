import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureReactRouterImports,
  fixLocalStorageParseFallback,
} from "@/core/typescript/greenfieldQuickFixes";
import { sanitizeAppIntegration } from "@/core/greenfield/appIntegrationSanitizer";

describe("greenfieldQuickFixes", () => {
  it("adds missing Route/Routes imports", () => {
    const source = `export default function App() {
  return (
    <Routes>
      <Route path="/" element={<div />} />
    </Routes>
  );
}`;
    const next = ensureReactRouterImports(source);
    assert.ok(next);
    assert.match(next!, /import \{ .*Route.*Routes.* \} from "react-router-dom"/);
  });

  it("wraps localStorage JSON.parse with fallback", () => {
    const source =
      'const data = JSON.parse(localStorage.getItem("jobs") ?? "[]");';
    const next = fixLocalStorageParseFallback(source);
    assert.ok(next);
    assert.match(next!, /try \{/);
    assert.match(next!, /catch \{/);
  });

  it("removes nested BrowserRouter via sanitizeAppIntegration", () => {
    const input = `import { BrowserRouter, Routes, Route } from 'react-router-dom';
export default function App() {
  return (
    <BrowserRouter>
      <Routes><Route path="/" element={<div />} /></Routes>
    </BrowserRouter>
  );
}`;
    const out = sanitizeAppIntegration(input);
    assert.doesNotMatch(out, /BrowserRouter/);
  });
});
