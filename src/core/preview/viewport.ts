/** Preview viewport device, zoom, and fit preferences (UI only). */

/** Device/zoom/fit toolbar — off until basic full-height preview is stable. */
export const enableAdvancedPreviewControls = false;

/** @deprecated Use {@link enableAdvancedPreviewControls}. */
export const PREVIEW_VIEWPORT_CONTROLS_ENABLED = enableAdvancedPreviewControls;

export const PREVIEW_VIEWPORT_STORAGE_KEY = "bryantlabs-studio-preview-viewport";

export const PREVIEW_DEBUG_LAYERS_STORAGE_KEY =
  "bryantlabs-preview-debug-layers";

export type PreviewDeviceId = "desktop" | "tablet" | "mobile" | "full";

export type PreviewFitMode = "fit-width" | "fit-height" | "actual-size";

export type PreviewZoomLevel = 0.75 | 1 | 1.25;

export interface PreviewViewportPrefs {
  readonly deviceId: PreviewDeviceId;
  readonly zoom: PreviewZoomLevel;
  readonly fitMode: PreviewFitMode;
}

export const PREVIEW_VIEWPORT_DEFAULTS: PreviewViewportPrefs = {
  deviceId: "desktop",
  zoom: 1,
  fitMode: "actual-size",
};

export const PREVIEW_DEVICE_OPTIONS: ReadonlyArray<{
  readonly id: PreviewDeviceId;
  readonly label: string;
}> = [
  { id: "desktop", label: "Desktop" },
  { id: "tablet", label: "Tablet" },
  { id: "mobile", label: "Mobile" },
  { id: "full", label: "Full width" },
];

/** Max-width presets for tablet/mobile only; desktop/full use panel size. */
export const PREVIEW_DEVICE_MAX_WIDTH_PX: Record<
  "tablet" | "mobile",
  number
> = {
  tablet: 768,
  mobile: 390,
};

const ZOOM_LEVELS: readonly PreviewZoomLevel[] = [0.75, 1, 1.25];

export function isPreviewZoomLevel(n: number): n is PreviewZoomLevel {
  return (ZOOM_LEVELS as readonly number[]).includes(n);
}

export function loadPreviewViewportPrefs(): PreviewViewportPrefs {
  try {
    const raw = localStorage.getItem(PREVIEW_VIEWPORT_STORAGE_KEY);
    if (!raw) return { ...PREVIEW_VIEWPORT_DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<PreviewViewportPrefs>;
    const deviceId =
      parsed.deviceId === "desktop" ||
      parsed.deviceId === "tablet" ||
      parsed.deviceId === "mobile" ||
      parsed.deviceId === "full"
        ? parsed.deviceId
        : PREVIEW_VIEWPORT_DEFAULTS.deviceId;
    const zoom =
      typeof parsed.zoom === "number" && isPreviewZoomLevel(parsed.zoom)
        ? parsed.zoom
        : PREVIEW_VIEWPORT_DEFAULTS.zoom;
    const fitMode =
      parsed.fitMode === "fit-width" ||
      parsed.fitMode === "fit-height" ||
      parsed.fitMode === "actual-size"
        ? parsed.fitMode
        : PREVIEW_VIEWPORT_DEFAULTS.fitMode;
    return { deviceId, zoom, fitMode };
  } catch {
    return { ...PREVIEW_VIEWPORT_DEFAULTS };
  }
}

export function savePreviewViewportPrefs(prefs: PreviewViewportPrefs): void {
  try {
    localStorage.setItem(PREVIEW_VIEWPORT_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* ignore */
  }
}

export function loadPreviewDebugLayers(): boolean {
  try {
    return localStorage.getItem(PREVIEW_DEBUG_LAYERS_STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

export function savePreviewDebugLayers(on: boolean): void {
  try {
    localStorage.setItem(PREVIEW_DEBUG_LAYERS_STORAGE_KEY, on ? "1" : "0");
  } catch {
    /* ignore */
  }
}

/** Scale + device constraints; frame always fills available preview area via CSS. */
export interface PreviewCanvasMetrics {
  /** Scroll region width (preview panel content area). */
  readonly availableWidthPx: number;
  /** Scroll region height (below toolbar). */
  readonly availableHeightPx: number;
  /** Max width for device preset, or null = use full available width. */
  readonly deviceMaxWidthPx: number | null;
  /** Visual scale (zoom × fit); does not shrink frame container height. */
  readonly contentScale: number;
  readonly zoomLevel: number;
  readonly fitMode: PreviewFitMode;
  /** Measured guest document height (diagnostics / fit-height only). */
  readonly contentScrollHeightPx: number;
}

/**
 * Compute content scale from full panel dimensions.
 * Container size is always 100% × 100% of the scroll region (CSS).
 */
export function computePreviewCanvasMetrics(input: {
  readonly viewportWidth: number;
  readonly viewportHeight: number;
  readonly deviceId: PreviewDeviceId;
  readonly zoom: number;
  readonly fitMode: PreviewFitMode;
  readonly contentScrollHeight: number;
}): PreviewCanvasMetrics {
  const availableWidthPx = Math.max(1, Math.floor(input.viewportWidth));
  const availableHeightPx = Math.max(1, Math.floor(input.viewportHeight));
  const contentScrollHeightPx = Math.max(1, input.contentScrollHeight);

  const deviceMaxWidthPx =
    input.deviceId === "tablet"
      ? PREVIEW_DEVICE_MAX_WIDTH_PX.tablet
      : input.deviceId === "mobile"
        ? PREVIEW_DEVICE_MAX_WIDTH_PX.mobile
        : null;

  const frameWidthBasis =
    deviceMaxWidthPx !== null
      ? Math.min(deviceMaxWidthPx, availableWidthPx)
      : availableWidthPx;

  let contentScale = input.zoom;

  if (input.fitMode === "fit-width") {
    contentScale = input.zoom * (availableWidthPx / frameWidthBasis);
  } else if (input.fitMode === "fit-height") {
    contentScale =
      input.zoom * (availableHeightPx / contentScrollHeightPx);
  }

  return {
    availableWidthPx,
    availableHeightPx,
    deviceMaxWidthPx,
    contentScale,
    zoomLevel: input.zoom,
    fitMode: input.fitMode,
    contentScrollHeightPx,
  };
}

/** Script run inside the preview guest page to measure scrollable height. */
export const PREVIEW_GUEST_HEIGHT_SCRIPT = `(() => {
  const d = document.documentElement;
  const b = document.body;
  return Math.max(
    d.scrollHeight,
    d.offsetHeight,
    d.clientHeight,
    b ? b.scrollHeight : 0,
    b ? b.offsetHeight : 0,
    window.innerHeight || 0
  );
})()`;

export function deviceModeLabel(deviceId: PreviewDeviceId): string {
  return (
    PREVIEW_DEVICE_OPTIONS.find((o) => o.id === deviceId)?.label ?? deviceId
  );
}
