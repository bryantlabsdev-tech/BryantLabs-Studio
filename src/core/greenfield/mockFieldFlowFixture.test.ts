import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  MOCK_FIELDFLOW_MULTIPAGE_FIXTURE_TOKEN,
  isMockFieldFlowMultipageFixturePrompt,
} from "@/core/greenfield/mockFieldFlowFixture";

describe("mock FieldFlow fixture selector", () => {
  it("selects only the explicit test-only token", () => {
    assert.equal(
      isMockFieldFlowMultipageFixturePrompt(
        `Build FieldFlow with ${MOCK_FIELDFLOW_MULTIPAGE_FIXTURE_TOKEN}`,
      ),
      true,
    );
  });

  it("does not select generic FieldFlow prompts", () => {
    const prompt =
      "Build FieldFlow — a multi-page SaaS dashboard with leads, jobs, estimates, invoices, customers, and settings pages using React Router.";
    assert.equal(isMockFieldFlowMultipageFixturePrompt(prompt), false);
  });
});
