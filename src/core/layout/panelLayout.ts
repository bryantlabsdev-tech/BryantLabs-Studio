/** Persisted workspace panel sizes (layout only). */

export const PANEL_LAYOUT_STORAGE_KEY = "bryantlabs-studio-panel-layout";

export interface PanelLayout {
  /** Agent chat column (left of editor). */
  readonly leftWidth: number;
  /** Optional right details panel (files, search, tools). */
  readonly rightWidth: number;
  readonly dockHeight: number;
  readonly dockOpen: boolean;
  /** Cursor-style focus: widen agent column, minimize side panels. */
  readonly agentFocusMode: boolean;
}

export const PANEL_LAYOUT_DEFAULTS: PanelLayout = {
  leftWidth: 380,
  rightWidth: 260,
  dockHeight: 190,
  dockOpen: true,
  agentFocusMode: true,
};

export const PANEL_LAYOUT_LIMITS = {
  leftMin: 240,
  leftMax: 560,
  leftMaxFocus: 780,
  rightMin: 240,
  rightMax: 640,
  dockMin: 120,
  dockMax: 480,
  centerMin: 280,
  iconRailWidth: 52,
  resizeHandleBreadth: 5,
} as const;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function clampPanelLayout(layout: PanelLayout): PanelLayout {
  const { leftMin, leftMax, leftMaxFocus, rightMin, rightMax, dockMin, dockMax } =
    PANEL_LAYOUT_LIMITS;
  const dockOpen = layout.dockOpen === true;
  const leftCap = layout.agentFocusMode === true ? leftMaxFocus : leftMax;
  return {
    leftWidth: clamp(layout.leftWidth, leftMin, leftCap),
    rightWidth: clamp(layout.rightWidth, rightMin, rightMax),
    dockHeight: dockOpen ? clamp(layout.dockHeight, dockMin, dockMax) : 0,
    dockOpen,
    agentFocusMode: layout.agentFocusMode === true,
  };
}

export function loadPanelLayout(): PanelLayout {
  try {
    const raw = localStorage.getItem(PANEL_LAYOUT_STORAGE_KEY);
    if (!raw) return { ...PANEL_LAYOUT_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PanelLayout>;
    return clampPanelLayout({
      leftWidth:
        typeof parsed.leftWidth === "number"
          ? parsed.leftWidth
          : PANEL_LAYOUT_DEFAULTS.leftWidth,
      rightWidth:
        typeof parsed.rightWidth === "number"
          ? parsed.rightWidth
          : PANEL_LAYOUT_DEFAULTS.rightWidth,
      dockHeight:
        typeof parsed.dockHeight === "number"
          ? parsed.dockHeight
          : PANEL_LAYOUT_DEFAULTS.dockHeight,
      dockOpen: parsed.dockOpen === true,
      agentFocusMode:
        parsed.agentFocusMode !== undefined
          ? parsed.agentFocusMode === true
          : PANEL_LAYOUT_DEFAULTS.agentFocusMode,
    });
  } catch {
    return { ...PANEL_LAYOUT_DEFAULTS };
  }
}

export function savePanelLayout(layout: PanelLayout): void {
  try {
    localStorage.setItem(
      PANEL_LAYOUT_STORAGE_KEY,
      JSON.stringify(clampPanelLayout(layout)),
    );
  } catch {
    /* ignore quota / private mode */
  }
}

/** Keep center column usable when resizing side panels. */
export function clampLeftWidth(
  layout: PanelLayout,
  columnsWidth: number,
  nextLeft: number,
): number {
  const { iconRailWidth, resizeHandleBreadth, centerMin, leftMin, leftMax, leftMaxFocus } =
    PANEL_LAYOUT_LIMITS;
  const handles = resizeHandleBreadth * 2;
  const leftCap = layout.agentFocusMode === true ? leftMaxFocus : leftMax;
  const maxLeft =
    columnsWidth -
    iconRailWidth -
    handles -
    layout.rightWidth -
    centerMin;
  return clamp(nextLeft, leftMin, Math.min(leftCap, maxLeft));
}

export function clampRightWidth(
  layout: PanelLayout,
  columnsWidth: number,
  nextRight: number,
): number {
  const { iconRailWidth, resizeHandleBreadth, centerMin, rightMin, rightMax } =
    PANEL_LAYOUT_LIMITS;
  const handles = resizeHandleBreadth * 2;
  const maxRight =
    columnsWidth -
    iconRailWidth -
    handles -
    layout.leftWidth -
    centerMin;
  return clamp(nextRight, rightMin, Math.min(rightMax, maxRight));
}

export function clampDockHeight(
  shellHeight: number,
  nextDock: number,
): number {
  const { dockMin, dockMax, centerMin } = PANEL_LAYOUT_LIMITS;
  const maxByShell = Math.min(
    dockMax,
    Math.max(dockMin, Math.floor(shellHeight * 0.55)),
  );
  const maxByCenter = shellHeight - centerMin - PANEL_LAYOUT_LIMITS.resizeHandleBreadth;
  const max = Math.min(maxByShell, maxByCenter);
  return clamp(nextDock, dockMin, Math.max(dockMin, max));
}

/** Widen agent column for focus mode; shrink side panels. */
export function layoutForAgentFocus(
  layout: PanelLayout,
  columnsWidth: number,
): PanelLayout {
  const { iconRailWidth, resizeHandleBreadth, centerMin, rightMin, leftMin, leftMaxFocus } =
    PANEL_LAYOUT_LIMITS;
  const handles = resizeHandleBreadth * 2;
  const targetRight = rightMin;
  const maxLeft =
    columnsWidth - iconRailWidth - handles - targetRight - centerMin;
  const preferred = Math.floor(columnsWidth * 0.46);
  return clampPanelLayout({
    ...layout,
    agentFocusMode: true,
    leftWidth: clamp(preferred, Math.max(leftMin, 420), Math.min(leftMaxFocus, maxLeft)),
    rightWidth: targetRight,
    dockOpen: false,
    dockHeight: 0,
  });
}
