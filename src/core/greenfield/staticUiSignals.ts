/** Source-only UI gate for stress tests (no preview DOM snapshot). */

export interface StaticUiGateResult {
  readonly ok: boolean;
  readonly issues: readonly string[];
}

export function evaluateStaticGreenfieldUiGate(
  appSource: string | null,
  cssSource: string | null,
): StaticUiGateResult {
  const issues: string[] = [];
  if (!appSource?.trim()) {
    issues.push("app_missing");
    return { ok: false, issues };
  }

  if (!/<Routes[\s>]/.test(appSource)) issues.push("no_routes");
  if (!/<Route[\s>]/.test(appSource)) issues.push("no_route");
  if (!/Layout|Sidebar|<nav|dashboard/i.test(appSource)) {
    issues.push("no_shell");
  }
  if (!cssSource || cssSource.trim().length < 40) {
    issues.push("css_empty");
  }

  return { ok: issues.length === 0, issues };
}
