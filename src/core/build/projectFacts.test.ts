import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveProjectFacts } from "./projectFacts.ts";
import { emptySessionMemory, recordPrompt } from "@/core/sessionMemory/store";

describe("deriveProjectFacts", () => {
  it("marks timer present when mentioned in successful studio chat for productivity", () => {
    const memory = recordPrompt(
      emptySessionMemory(),
      "Build a task manager with a timer",
    );
    const facts = deriveProjectFacts(memory, [
      {
        id: "1",
        role: "user",
        text: "Add timer",
        at: Date.now(),
      },
      {
        id: "2",
        role: "studio",
        text: "Added timer state",
        at: Date.now(),
        outcome: "success",
      },
    ]);
    assert.equal(facts.find((f) => f.id === "timer")?.present, true);
  });
});
