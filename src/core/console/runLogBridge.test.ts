import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  categoryForStage,
  formatConsoleTime,
  runLogToConsoleEntry,
  titleForRunLog,
} from "@/core/console/runLogBridge";

describe("runLogBridge", () => {
  it("maps planner stages to AI category", () => {
    assert.equal(categoryForStage("pipeline_planner"), "ai");
    assert.equal(categoryForStage("write"), "files");
    assert.equal(categoryForStage("typescript"), "build");
  });

  it("formats friendly titles for common stages", () => {
    assert.equal(
      titleForRunLog("pipeline_planner", "running", "Planner phase"),
      "Planner Started",
    );
    assert.equal(
      titleForRunLog("typescript", "success", "tsc ok"),
      "TypeScript Passed",
    );
    assert.equal(
      titleForRunLog("preview", "success", "Preview ready"),
      "Preview Updated",
    );
  });

  it("builds structured console entries from run log rows", () => {
    const entry = runLogToConsoleEntry({
      runId: "run-1",
      timestamp: new Date("2026-06-06T00:19:03Z").toISOString(),
      stage: "pipeline_planner",
      status: "running",
      message: "openrouter / gemini-2.5-pro",
      provider: "openrouter",
      model: "gemini-2.5-pro",
    });
    assert.equal(entry.title, "Planner Started");
    assert.equal(entry.category, "ai");
    assert.equal(entry.fields.provider, "openrouter");
    assert.equal(entry.fields.model, "gemini-2.5-pro");
  });

  it("formats console time as HH:MM:SS", () => {
    const formatted = formatConsoleTime("2026-06-06T00:19:02.000Z");
    assert.match(formatted, /^\d{2}:\d{2}:\d{2}$/);
  });
});
