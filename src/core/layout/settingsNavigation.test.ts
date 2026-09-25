import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ensureDetailsPanelVisible,
  layoutForAgentFocus,
  PANEL_LAYOUT_DEFAULTS,
} from "@/core/layout/panelLayout";
import {
  dispatchOpenDetailsPanel,
  isSettingsRailTool,
  OPEN_DETAILS_PANEL_EVENT,
  openSettingsNavigation,
  PROVIDER_ENABLEMENT_TEST_ID,
  AGENT_EXECUTION_POLICY_TEST_ID,
  resolveWorkflowPanelViewId,
  SETTINGS_RAIL_TOOL,
  SETTINGS_VIEW_TEST_ID,
} from "@/core/layout/settingsNavigation";

function withWindowMock(run: () => void): void {
  const original = globalThis.window;
  const listeners = new Map<string, Set<EventListener>>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      addEventListener: (type: string, listener: EventListener) => {
        const set = listeners.get(type) ?? new Set();
        set.add(listener);
        listeners.set(type, set);
      },
      removeEventListener: (type: string, listener: EventListener) => {
        listeners.get(type)?.delete(listener);
      },
      dispatchEvent: (event: Event) => {
        for (const listener of listeners.get(event.type) ?? []) {
          listener(event);
        }
        return true;
      },
    },
  });
  try {
    run();
  } finally {
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: original,
    });
  }
}

describe("settingsNavigation", () => {
  it("maps providers rail tool to settings panel view", () => {
    assert.equal(resolveWorkflowPanelViewId(SETTINGS_RAIL_TOOL), "settings");
    assert.equal(isSettingsRailTool("providers"), true);
    assert.equal(isSettingsRailTool("files"), false);
  });

  it("openSettingsNavigation selects providers and dispatches panel reveal", () => {
    withWindowMock(() => {
      let railTool = "files";
      const events: string[] = [];
      const onOpen = () => events.push("open");
      window.addEventListener(OPEN_DETAILS_PANEL_EVENT, onOpen);
      try {
        openSettingsNavigation((tool) => {
          railTool = tool;
        });
        assert.equal(railTool, SETTINGS_RAIL_TOOL);
        assert.deepEqual(events, ["open"]);
      } finally {
        window.removeEventListener(OPEN_DETAILS_PANEL_EVENT, onOpen);
      }
    });
  });

  it("dispatchOpenDetailsPanel emits the reveal event", () => {
    withWindowMock(() => {
      let fired = false;
      const onOpen = () => {
        fired = true;
      };
      window.addEventListener(OPEN_DETAILS_PANEL_EVENT, onOpen);
      try {
        dispatchOpenDetailsPanel();
        assert.equal(fired, true);
      } finally {
        window.removeEventListener(OPEN_DETAILS_PANEL_EVENT, onOpen);
      }
    });
  });

  it("clicking Settings in agent focus reveals details panel for providers view", () => {
    withWindowMock(() => {
      const focused = layoutForAgentFocus(PANEL_LAYOUT_DEFAULTS, 1280);
      assert.equal(focused.agentFocusMode, true);

      let layout = focused;
      const onOpen = () => {
        layout = ensureDetailsPanelVisible(layout);
      };
      window.addEventListener(OPEN_DETAILS_PANEL_EVENT, onOpen);
      try {
        let railTool = "files";
        openSettingsNavigation((tool) => {
          railTool = tool;
        });
        assert.equal(railTool, SETTINGS_RAIL_TOOL);
        assert.equal(layout.agentFocusMode, false);
        assert.ok(layout.rightWidth >= PANEL_LAYOUT_DEFAULTS.rightWidth);
        assert.equal(
          resolveWorkflowPanelViewId(railTool as typeof SETTINGS_RAIL_TOOL),
          "settings",
        );
      } finally {
        window.removeEventListener(OPEN_DETAILS_PANEL_EVENT, onOpen);
      }
    });
  });

  it("exports stable test ids for Settings and provider enablement controls", () => {
    assert.equal(SETTINGS_VIEW_TEST_ID, "settings-view");
    assert.equal(PROVIDER_ENABLEMENT_TEST_ID, "provider-enablement");
    assert.equal(AGENT_EXECUTION_POLICY_TEST_ID, "agent-execution-policy");
  });
});
