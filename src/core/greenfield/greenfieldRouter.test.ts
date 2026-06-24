import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { classifyGreenfieldGenerationRoute } from "@/core/greenfield/greenfieldRouter";

describe("greenfieldRouter", () => {
  it("routes FieldFlow-class prompts to multi-phase", () => {
    const prompt = `
Build FieldFlow CRM — React TypeScript Vite Tailwind React Router Lucide localStorage.
Pages: Dashboard, Leads, Jobs, Estimates, Invoices, Customers, Settings.
CRUD tables, KPI cards, status badges, sidebar navigation.
    `.trim();
    const route = classifyGreenfieldGenerationRoute(prompt);
    assert.equal(route.mode, "multi-phase");
    assert.ok(route.score >= 4);
  });

  it("routes simple calculator prompts to lite", () => {
    const route = classifyGreenfieldGenerationRoute("Build a minimal calculator single page app.");
    assert.equal(route.mode, "lite");
  });
});
