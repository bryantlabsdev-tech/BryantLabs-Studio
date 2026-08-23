import type { RailTool } from "@/core/layout/types";

/** Rail tool id for Settings → Providers (historical id: providers). */
export const SETTINGS_RAIL_TOOL = "providers" as const satisfies RailTool;

export const SETTINGS_VIEW_TEST_ID = "settings-view";
export const PROVIDER_ENABLEMENT_TEST_ID = "provider-enablement";

export const OPEN_DETAILS_PANEL_EVENT = "bryantlabs:open-details-panel";

export function isSettingsRailTool(tool: RailTool): boolean {
  return tool === SETTINGS_RAIL_TOOL;
}

/** Reveal the right details column (exit agent-focus, restore width). */
export function dispatchOpenDetailsPanel(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_DETAILS_PANEL_EVENT));
}

export function openSettingsNavigation(
  setRailTool: (tool: RailTool) => void,
): void {
  dispatchOpenDetailsPanel();
  setRailTool(SETTINGS_RAIL_TOOL);
}

/** Which workflow panel body mounts for a rail selection. */
export function resolveWorkflowPanelViewId(railTool: RailTool): string {
  if (railTool === SETTINGS_RAIL_TOOL) return "settings";
  if (railTool === "files") return "explorer";
  return railTool;
}
