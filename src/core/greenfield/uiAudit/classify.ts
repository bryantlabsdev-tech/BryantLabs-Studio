import type {
  UiAuditLayoutType,
  UiDomSnapshot,
  UiLayoutClassification,
} from "@/core/greenfield/uiAudit/types";

import { isPuzzleGridSource } from "@/core/domain/classify";

interface SignalRule {
  readonly type: UiAuditLayoutType;
  readonly weight: number;
  readonly test: (blob: string, snapshot: UiDomSnapshot | null) => boolean;
}

function hasChatDomSignals(snapshot: UiDomSnapshot | null): boolean {
  if (!snapshot?.chat) return false;
  return snapshot.chat.messageCount > 0 || snapshot.chat.inputVisible;
}

const RULES: readonly SignalRule[] = [
  {
    type: "table_layout",
    weight: 12,
    test: (b, s) =>
      /\bcompare|comparison|product|price|rating|cosmetic|data-table|spreadsheet|\btable\b|data\s*grid|rows?\s+and\s+columns?/.test(
        b,
      ) || (s?.table != null && s.table.rowCount >= 2),
  },
  {
    type: "grid_layout",
    weight: 12,
    test: (b, s) =>
      /\bsudoku\b|sudoku-board|puzzle-grid|game-board|\.cell-row/.test(b) ||
      (isPuzzleGridSource(b, "") && s?.grid != null && s.grid.cellCount >= 16),
  },
  {
    type: "calculator_layout",
    weight: 11,
    test: (b, s) =>
      /\bcalculator\b|calc-display|number-pad|keypad/.test(b) ||
      (s?.calculator != null && s.calculator.buttonCount >= 4),
  },
  {
    type: "dashboard_layout",
    weight: 10,
    test: (b, s) =>
      /\bdashboard\b|kanban|task\s*board|build\s*board|sidebar|widget|analytics|panel|board-column/.test(
        b,
      ) || (s?.dashboardPanels != null && s.dashboardPanels.length >= 2),
  },
  {
    type: "chat_layout",
    weight: 9,
    test: (b, s) =>
      /\bchat\s*(app|ui|bot|room|interface)\b|chatgpt|messaging\s*app|conversation\s*(ui|thread)/.test(
        b,
      ) || hasChatDomSignals(s),
  },
  {
    type: "form_layout",
    weight: 9,
    test: (b, s) =>
      /\bform\b|signup|login|register|submit/.test(b) ||
      (s?.form != null && s.form.fieldCount >= 2),
  },
  {
    type: "mobile_layout",
    weight: 7,
    test: (b) => /\bmobile\b|responsive|touch|viewport|phone/.test(b),
  },
];

export function classifyUiLayout(
  _prompt: string,
  appSource: string | null,
  cssSource: string | null,
  snapshot: UiDomSnapshot | null = null,
): UiLayoutClassification {
  // Classify from generated app sources + preview DOM only — not the Studio composer prompt.
  const blob = `${appSource ?? ""}\n${cssSource ?? ""}`.toLowerCase();

  const scores = new Map<UiAuditLayoutType, { score: number; signals: string[] }>();

  for (const rule of RULES) {
    if (!rule.test(blob, snapshot)) continue;
    const prev = scores.get(rule.type) ?? { score: 0, signals: [] };
    scores.set(rule.type, {
      score: prev.score + rule.weight,
      signals: [...prev.signals, rule.type],
    });
  }

  let best: UiAuditLayoutType | "unclassified" = "unclassified";
  let bestScore = 0;
  let signals: string[] = [];

  for (const [type, data] of scores) {
    if (data.score > bestScore) {
      best = type;
      bestScore = data.score;
      signals = data.signals;
    }
  }

  if (best === "unclassified" && snapshot) {
    if (snapshot.table && snapshot.table.rowCount >= 2) {
      best = "table_layout";
      bestScore = 7;
      signals = ["dom:table"];
    } else if (
      snapshot.grid &&
      snapshot.grid.cellCount >= 9 &&
      isPuzzleGridSource(blob, "")
    ) {
      best = "grid_layout";
      bestScore = 6;
      signals = ["dom:puzzle_grid"];
    } else if (snapshot.dashboardPanels.length >= 2) {
      best = "dashboard_layout";
      bestScore = 6;
      signals = ["dom:dashboard"];
    } else if (snapshot.form && snapshot.form.fieldCount >= 1) {
      best = "form_layout";
      bestScore = 5;
      signals = ["dom:form"];
    } else if (snapshot.controls.length >= 3) {
      best = "mobile_layout";
      bestScore = 4;
      signals = ["dom:controls"];
    }
  }

  return {
    type: best,
    confidence: Math.min(100, bestScore * 8),
    signals,
  };
}

/** @deprecated Use classifyUiLayout */
export function resolveUiAuditKind(
  appSource: string | null,
  cssSource: string | null,
  prompt = "",
): UiAuditLayoutType | "unclassified" {
  return classifyUiLayout(prompt, appSource, cssSource).type;
}
