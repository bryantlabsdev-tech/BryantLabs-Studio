import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { emitGreenfieldConsoleEvent } from "@/core/console/greenfieldConsoleEvents";
import { studioEventBus } from "@/core/console/studioEventBus";
import type { StudioEvent } from "@/core/console/types";

describe("greenfieldConsoleEvents", () => {
  it("emits greenfield.stage events for each stage", () => {
    const received: StudioEvent[] = [];
    const unsub = studioEventBus.subscribe((event) => {
      received.push(event);
    });

    try {
      emitGreenfieldConsoleEvent("greenfield:start", {
        projectPath: "/tmp/app",
        provider: "gemini",
        model: "gemini-2.0-flash",
      });
      emitGreenfieldConsoleEvent("provider:start", { projectPath: "/tmp/app" });
      emitGreenfieldConsoleEvent("parser:success", { projectPath: "/tmp/app" });
      emitGreenfieldConsoleEvent("write:success", { projectPath: "/tmp/app" });
      emitGreenfieldConsoleEvent("npm:success", { projectPath: "/tmp/app" });
      emitGreenfieldConsoleEvent("typescript:success", { projectPath: "/tmp/app" });
      emitGreenfieldConsoleEvent("build:success", { projectPath: "/tmp/app" });
      emitGreenfieldConsoleEvent("preview:success", { projectPath: "/tmp/app" });
      emitGreenfieldConsoleEvent("greenfield:complete", { projectPath: "/tmp/app" });

      const stages = received
        .filter((e) => e.type === "greenfield.stage")
        .map((e) => (e.type === "greenfield.stage" ? e.stage : ""));

      assert.deepEqual(stages, [
        "greenfield:start",
        "provider:start",
        "parser:success",
        "write:success",
        "npm:success",
        "typescript:success",
        "build:success",
        "preview:success",
        "greenfield:complete",
      ]);

      assert.ok(received.some((e) => e.type === "run.started"));
      assert.ok(received.some((e) => e.type === "run.completed"));
    } finally {
      unsub();
    }
  });

  it("emits review and write transition stages", () => {
    const stages: string[] = [];
    const unsub = studioEventBus.subscribe((event) => {
      if (event.type === "greenfield.stage") stages.push(event.stage);
    });

    try {
      emitGreenfieldConsoleEvent("greenfield:review_ready", { projectPath: "/tmp/app" });
      emitGreenfieldConsoleEvent("greenfield:review_approved", { projectPath: "/tmp/app" });
      emitGreenfieldConsoleEvent("greenfield:write_start", { projectPath: "/tmp/app" });
      assert.deepEqual(stages, [
        "greenfield:review_ready",
        "greenfield:review_approved",
        "greenfield:write_start",
      ]);
    } finally {
      unsub();
    }
  });

  it("emits cancelled and stale-cleared stages", () => {
    const stages: string[] = [];
    const unsub = studioEventBus.subscribe((event) => {
      if (event.type === "greenfield.stage") stages.push(event.stage);
    });

    try {
      emitGreenfieldConsoleEvent("greenfield:cancelled", { projectPath: "/tmp/app" });
      emitGreenfieldConsoleEvent("greenfield:stale-cleared", { projectPath: "/tmp/app" });
      assert.deepEqual(stages, ["greenfield:cancelled", "greenfield:stale-cleared"]);
    } finally {
      unsub();
    }
  });
});
