/** DOM measurements for Preview panel layout debugging. */

import type { PreviewCanvasMetrics, PreviewFitMode } from "@/core/preview/viewport";

export interface PreviewLayoutDiagnostics {
  readonly panelWidth: number;
  readonly panelHeight: number;
  readonly toolbarClientHeight: number;
  readonly availableViewportHeight: number;
  readonly stageClientWidth: number;
  readonly stageClientHeight: number;
  readonly iframeClientWidth: number;
  readonly iframeClientHeight: number;
  readonly iframeScrollHeight: number;
  readonly deviceMode: string;
  readonly fitMode: PreviewFitMode;
  readonly zoomPercent: number;
  readonly contentScale: number;
  readonly overlayCount: number;
}

export function collectPreviewLayoutDiagnostics(
  shell: HTMLElement | null,
  toolbar: HTMLElement | null,
  scrollRegion: HTMLElement | null,
  stage: HTMLElement | null,
  frame: HTMLElement | null,
  metrics: PreviewCanvasMetrics,
  deviceModeLabel: string,
): PreviewLayoutDiagnostics {
  const overlayCount = scrollRegion
    ? scrollRegion.querySelectorAll(".preview-panel__overlay").length
    : 0;

  let iframeScrollHeight = 0;
  if (frame instanceof HTMLIFrameElement) {
    const doc = frame.contentDocument;
    if (doc) {
      iframeScrollHeight = Math.max(
        doc.documentElement.scrollHeight,
        doc.body?.scrollHeight ?? 0,
      );
    }
  }

  return {
    panelWidth: shell?.clientWidth ?? metrics.availableWidthPx,
    panelHeight: shell?.clientHeight ?? 0,
    toolbarClientHeight: toolbar?.clientHeight ?? 0,
    availableViewportHeight: scrollRegion?.clientHeight ?? metrics.availableHeightPx,
    stageClientWidth: stage?.clientWidth ?? 0,
    stageClientHeight: stage?.clientHeight ?? 0,
    iframeClientWidth: frame?.clientWidth ?? 0,
    iframeClientHeight: frame?.clientHeight ?? 0,
    iframeScrollHeight,
    deviceMode: deviceModeLabel,
    fitMode: metrics.fitMode,
    zoomPercent: Math.round(metrics.zoomLevel * 100),
    contentScale: metrics.contentScale,
    overlayCount,
  };
}
