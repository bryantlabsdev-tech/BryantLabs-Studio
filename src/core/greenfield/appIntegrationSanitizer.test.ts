import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { sanitizeAppIntegration } from "@/core/greenfield/appIntegrationSanitizer";

describe("appIntegrationSanitizer", () => {
  it("removes nested BrowserRouter from App.tsx", () => {
    const input = `import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { Layout } from './components/Layout';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/" element={<Layout />} />
      </Routes>
    </Router>
  );
}`;
    const out = sanitizeAppIntegration(input);
    assert.match(out, /Routes/);
    assert.doesNotMatch(out, /BrowserRouter|<Router>/);
  });

  it("fixes default Layout import to named export", () => {
    const out = sanitizeAppIntegration(
      `import Layout from "./components/Layout";\nexport default function App() { return <Layout />; }`,
    );
    assert.match(out, /import \{ Layout \}/);
  });
});
