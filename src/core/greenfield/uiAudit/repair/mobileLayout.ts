import { ensureResponsiveRoot, USABLE_CONTROLS_CSS, appendCssBlock } from "@/core/greenfield/uiAudit/repair/sharedCss";
import type { UiRepairPatch } from "@/core/greenfield/uiAudit/repair/types";

export const MOBILE_LAYOUT_REPAIR_STRATEGY = "mobile_layout_css";

export function buildMobileLayoutRepairPatches(
  _appSource: string | null,
  cssSource: string | null,
): UiRepairPatch[] {
  if (!cssSource) return [];
  let next = ensureResponsiveRoot(cssSource);
  next = appendCssBlock(next, USABLE_CONTROLS_CSS, "ui-audit:mobile-controls");
  const block = `@media (max-width: 768px) {
  main,
  .app-container {
    flex-direction: column;
    align-items: stretch;
    padding: 1rem;
  }
}`;
  next = appendCssBlock(next, block, "ui-audit:mobile-stack");
  if (next === cssSource) return [];
  return [{ relPath: "src/index.css", content: next }];
}
