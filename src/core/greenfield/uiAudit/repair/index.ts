import type { UiAuditLayoutType } from "@/core/greenfield/uiAudit/types";
import {
  buildCalculatorLayoutRepairPatches,
  CALCULATOR_LAYOUT_REPAIR_STRATEGY,
} from "@/core/greenfield/uiAudit/repair/calculatorLayout";
import {
  buildFormLayoutRepairPatches,
  FORM_LAYOUT_REPAIR_STRATEGY,
} from "@/core/greenfield/uiAudit/repair/formLayout";
import {
  buildGridLayoutRepairPatches,
  GRID_LAYOUT_REPAIR_STRATEGY,
} from "@/core/greenfield/uiAudit/repair/gridLayout";
import {
  buildMobileLayoutRepairPatches,
  MOBILE_LAYOUT_REPAIR_STRATEGY,
} from "@/core/greenfield/uiAudit/repair/mobileLayout";
import type { UiRepairOutcome } from "@/core/greenfield/uiAudit/repair/types";
import { USABLE_CONTROLS_CSS, appendCssBlock } from "@/core/greenfield/uiAudit/repair/sharedCss";

const DASHBOARD_STRATEGY = "dashboard_layout_css";
const CHAT_STRATEGY = "chat_layout_css";
const TABLE_STRATEGY = "table_layout_css";

function buildDashboardLayoutRepairPatches(
  _appSource: string | null,
  cssSource: string | null,
) {
  if (!cssSource) return [];
  const block = `.panel,
.card,
.widget,
.dashboard-panel,
.panel-card,
[class*="rounded-lg"][class*="border"],
main [class*="grid"] > div {
  min-width: 120px;
  min-height: 80px;
  display: block;
}`;
  const next = appendCssBlock(cssSource, block, "ui-audit:dashboard-layout");
  if (next === cssSource) return [];
  return [{ relPath: "src/index.css", content: next }];
}

function buildChatLayoutRepairPatches(
  _appSource: string | null,
  cssSource: string | null,
) {
  if (!cssSource) return [];
  const block = `.chat-thread,
.messages,
.chat-messages {
  min-height: 200px;
  max-height: 60vh;
  overflow-y: auto;
}

.chat-input,
textarea[placeholder*="message" i],
input[placeholder*="message" i] {
  min-height: 44px;
  width: 100%;
}`;
  const next = appendCssBlock(cssSource, block, "ui-audit:chat-layout");
  if (next === cssSource) return [];
  return [{ relPath: "src/index.css", content: next }];
}

function buildTableLayoutRepairPatches(
  _appSource: string | null,
  cssSource: string | null,
) {
  if (!cssSource) return [];
  const block = `table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
}

thead th {
  position: sticky;
  top: 0;
  background: inherit;
  min-height: 36px;
}

td,
th {
  min-width: 48px;
  padding: 0.5rem;
}`;
  const next = appendCssBlock(cssSource, block, "ui-audit:table-layout");
  if (next === cssSource) return [];
  return [{ relPath: "src/index.css", content: next }];
}

export function resolveUiRepairStrategy(type: UiAuditLayoutType | "unclassified"): string {
  switch (type) {
    case "grid_layout":
      return GRID_LAYOUT_REPAIR_STRATEGY;
    case "form_layout":
      return FORM_LAYOUT_REPAIR_STRATEGY;
    case "dashboard_layout":
      return DASHBOARD_STRATEGY;
    case "calculator_layout":
      return CALCULATOR_LAYOUT_REPAIR_STRATEGY;
    case "chat_layout":
      return CHAT_STRATEGY;
    case "table_layout":
      return TABLE_STRATEGY;
    case "mobile_layout":
    case "unclassified":
    default:
      return MOBILE_LAYOUT_REPAIR_STRATEGY;
  }
}

export function buildUiRepairPatches(
  type: UiAuditLayoutType | "unclassified",
  appSource: string | null,
  cssSource: string | null,
): UiRepairOutcome {
  let patches;
  let strategy: string;

  switch (type) {
    case "grid_layout":
      strategy = GRID_LAYOUT_REPAIR_STRATEGY;
      patches = buildGridLayoutRepairPatches(appSource, cssSource);
      break;
    case "form_layout":
      strategy = FORM_LAYOUT_REPAIR_STRATEGY;
      patches = buildFormLayoutRepairPatches(appSource, cssSource);
      break;
    case "dashboard_layout":
      strategy = DASHBOARD_STRATEGY;
      patches = buildDashboardLayoutRepairPatches(appSource, cssSource);
      break;
    case "calculator_layout":
      strategy = CALCULATOR_LAYOUT_REPAIR_STRATEGY;
      patches = buildCalculatorLayoutRepairPatches(appSource, cssSource);
      break;
    case "chat_layout":
      strategy = CHAT_STRATEGY;
      patches = buildChatLayoutRepairPatches(appSource, cssSource);
      break;
    case "table_layout":
      strategy = TABLE_STRATEGY;
      patches = buildTableLayoutRepairPatches(appSource, cssSource);
      break;
    case "mobile_layout":
    case "unclassified":
    default:
      strategy = MOBILE_LAYOUT_REPAIR_STRATEGY;
      patches = buildMobileLayoutRepairPatches(appSource, cssSource);
      if (patches.length === 0 && cssSource) {
        const next = appendCssBlock(cssSource, USABLE_CONTROLS_CSS, "ui-audit:fallback-controls");
        patches = next !== cssSource ? [{ relPath: "src/index.css", content: next }] : [];
      }
      break;
  }

  return { strategy, patches };
}
