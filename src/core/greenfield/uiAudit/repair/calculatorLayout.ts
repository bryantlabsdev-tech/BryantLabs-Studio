import { appendCssBlock } from "@/core/greenfield/uiAudit/repair/sharedCss";
import type { UiRepairPatch } from "@/core/greenfield/uiAudit/repair/types";

export const CALCULATOR_LAYOUT_REPAIR_STRATEGY = "calculator_layout_css";

export function buildCalculatorLayoutRepairPatches(
  _appSource: string | null,
  cssSource: string | null,
): UiRepairPatch[] {
  if (!cssSource) return [];
  const block = `.calculator-display,
.display,
.calc-display,
[class*="display"] {
  min-height: 48px;
  font-size: clamp(1.5rem, 4vw, 2.5rem);
  padding: 0.75rem;
}

.number-pad,
.keypad,
.calculator button {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.5rem;
}

.number-pad button,
.keypad button,
.calculator button {
  width: clamp(52px, 14vw, 80px);
  height: clamp(52px, 14vw, 80px);
  font-size: clamp(1.25rem, 3vw, 1.75rem);
}`;
  const next = appendCssBlock(cssSource, block, "ui-audit:calculator-layout");
  if (next === cssSource) return [];
  return [{ relPath: "src/index.css", content: next }];
}
