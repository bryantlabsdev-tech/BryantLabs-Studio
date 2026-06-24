import type { PanelMeta } from "@/types";

/**
 * Declarative descriptions of the panels that still use the generic Panel
 * shell. (The sidebar and the right panel use their own tabbed headers.)
 */
export const EDITOR_PANEL: PanelMeta = {
  id: "editor",
  title: "Editor",
  subtitle: "Read-only viewer",
};
