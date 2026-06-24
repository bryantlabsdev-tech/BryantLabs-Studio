import {
  appendCssBlock,
  USABLE_CONTROLS_CSS,
} from "@/core/greenfield/uiAudit/repair/sharedCss";
import type { UiRepairPatch } from "@/core/greenfield/uiAudit/repair/types";

export const FORM_LAYOUT_REPAIR_STRATEGY = "form_layout_css";

export function buildFormLayoutRepairPatches(
  _appSource: string | null,
  cssSource: string | null,
): UiRepairPatch[] {
  if (!cssSource) return [];
  let next = appendCssBlock(cssSource, USABLE_CONTROLS_CSS, "ui-audit:form-controls");
  const formBlock = `form {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  max-width: 480px;
  width: 100%;
}

form input,
form select,
form textarea {
  width: 100%;
  min-height: 44px;
}

form button[type="submit"],
form input[type="submit"] {
  display: block;
  width: 100%;
  margin-top: 0.5rem;
}`;
  next = appendCssBlock(next, formBlock, "ui-audit:form-layout");
  if (next === cssSource) return [];
  return [{ relPath: "src/index.css", content: next }];
}
