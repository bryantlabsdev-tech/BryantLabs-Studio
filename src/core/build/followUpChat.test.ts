import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mergeFollowUpChat, type FollowUpChatMessage } from "@/core/build/followUpChat";

describe("mergeFollowUpChat", () => {
  it("unions disk and local messages by id for reopen restore", () => {
    const disk: FollowUpChatMessage[] = [
      { id: "a", role: "user", text: "Create a task manager", at: 1 },
      { id: "b", role: "studio", text: "Created 7 files", at: 2 },
    ];
    const local: FollowUpChatMessage[] = [
      { id: "b", role: "studio", text: "Created 7 files", at: 2 },
      { id: "c", role: "user", text: "Add a hint under the field", at: 3 },
    ];
    const merged = mergeFollowUpChat(disk, local);
    assert.deepEqual(
      merged.map((m) => m.id),
      ["a", "b", "c"],
    );
  });
});
