import { appendCssBlock } from "@/core/greenfield/uiAudit/repair/sharedCss";
import { isPremiumStylingPrompt } from "@/core/contextEngine/classify";

const PREMIUM_CSS_MARKER = "ui-edit:premium-fallback";

export const PREMIUM_UI_CSS = `
:root {
  --premium-bg: #0f1117;
  --premium-surface: #1a1d27;
  --premium-border: rgba(255, 255, 255, 0.08);
  --premium-text: #f4f4f5;
  --premium-muted: #a1a1aa;
  --premium-accent: #c9a227;
  --premium-radius: 12px;
  --premium-shadow: 0 8px 32px rgba(0, 0, 0, 0.35);
}

body {
  background: var(--premium-bg);
  color: var(--premium-text);
  font-family: "Inter", system-ui, -apple-system, sans-serif;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
}

#root,
.app-container,
main {
  max-width: min(960px, 100%);
  margin: 0 auto;
  padding: 1.5rem;
  box-sizing: border-box;
}

button,
.btn,
input[type="button"],
input[type="submit"] {
  min-height: 44px;
  padding: 0.625rem 1.125rem;
  border-radius: var(--premium-radius);
  border: 1px solid var(--premium-border);
  background: var(--premium-surface);
  color: var(--premium-text);
  font-weight: 600;
  letter-spacing: 0.02em;
  box-shadow: var(--premium-shadow);
  transition: transform 0.15s ease, border-color 0.15s ease;
}

button:hover,
.btn:hover {
  border-color: var(--premium-accent);
  transform: translateY(-1px);
}

.cell,
.sudoku-cell,
.grid-cell {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: calc(var(--premium-radius) * 0.5);
  background: var(--premium-surface);
  border: 1px solid var(--premium-border);
  font-variant-numeric: tabular-nums;
  font-weight: 600;
}
`;

export interface UiEditDeterministicResult {
  readonly ok: boolean;
  readonly files: Record<string, string>;
  readonly plan: string;
}

/** CSS-only premium styling when AI is unavailable or over token budget. */
export function applyPremiumUiEditFallback(opts: {
  prompt: string;
  indexCss: string;
}): UiEditDeterministicResult | null {
  if (!isPremiumStylingPrompt(opts.prompt)) return null;
  const patched = appendCssBlock(opts.indexCss, PREMIUM_UI_CSS, PREMIUM_CSS_MARKER);
  if (patched === opts.indexCss) {
    return {
      ok: true,
      files: { "src/index.css": patched },
      plan: "Applied deterministic premium CSS fallback (typography, surfaces, controls).",
    };
  }
  return {
    ok: true,
    files: { "src/index.css": patched },
    plan: "Applied deterministic premium CSS fallback (typography, surfaces, controls).",
  };
}
