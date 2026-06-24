import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  isScrollNearBottom,
  shouldAutoScrollAgentChat,
  shouldScrollOnRunComplete,
} from "@/core/agent/agentChatAutoScroll";

describe("agentChatAutoScroll", () => {
  it("detects when scroll is near bottom", () => {
    assert.equal(
      isScrollNearBottom({ scrollTop: 952, scrollHeight: 1000, clientHeight: 40 }),
      true,
    );
    assert.equal(
      isScrollNearBottom({ scrollTop: 800, scrollHeight: 1000, clientHeight: 40 }),
      false,
    );
  });

  it("auto-scrolls only while run is active and user has not scrolled up", () => {
    assert.equal(
      shouldAutoScrollAgentChat({ runActive: true, userPausedAutoScroll: false }),
      true,
    );
    assert.equal(
      shouldAutoScrollAgentChat({ runActive: true, userPausedAutoScroll: true }),
      false,
    );
    assert.equal(
      shouldAutoScrollAgentChat({ runActive: false, userPausedAutoScroll: false }),
      false,
    );
  });

  it("scrolls once when run completes", () => {
    assert.equal(
      shouldScrollOnRunComplete({ wasActive: true, isActive: false }),
      true,
    );
    assert.equal(
      shouldScrollOnRunComplete({ wasActive: false, isActive: false }),
      false,
    );
    assert.equal(
      shouldScrollOnRunComplete({ wasActive: true, isActive: true }),
      false,
    );
  });
});
