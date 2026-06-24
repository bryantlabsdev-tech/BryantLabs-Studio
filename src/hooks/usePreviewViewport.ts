import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  computePreviewCanvasMetrics,
  loadPreviewViewportPrefs,
  savePreviewViewportPrefs,
  type PreviewCanvasMetrics,
  type PreviewDeviceId,
  type PreviewFitMode,
  type PreviewViewportPrefs,
  type PreviewZoomLevel,
} from "@/core/preview/viewport";

export function usePreviewViewport() {
  const viewportRef = useRef<HTMLDivElement>(null);
  const [prefs, setPrefs] = useState<PreviewViewportPrefs>(loadPreviewViewportPrefs);
  const [viewportSize, setViewportSize] = useState({ width: 1, height: 1 });
  const [contentScrollHeight, setContentScrollHeight] = useState(1);

  const persist = useCallback((next: PreviewViewportPrefs) => {
    setPrefs(next);
    savePreviewViewportPrefs(next);
  }, []);

  const setDeviceId = useCallback(
    (deviceId: PreviewDeviceId) => {
      persist({ ...prefs, deviceId });
    },
    [persist, prefs],
  );

  const setZoom = useCallback(
    (zoom: PreviewZoomLevel) => {
      persist({ ...prefs, zoom });
    },
    [persist, prefs],
  );

  const setFitMode = useCallback(
    (fitMode: PreviewFitMode) => {
      persist({ ...prefs, fitMode });
    },
    [persist, prefs],
  );

  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;

    const update = () => {
      setViewportSize({
        width: el.clientWidth,
        height: el.clientHeight,
      });
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const metrics: PreviewCanvasMetrics = useMemo(
    () =>
      computePreviewCanvasMetrics({
        viewportWidth: viewportSize.width,
        viewportHeight: viewportSize.height,
        deviceId: prefs.deviceId,
        zoom: prefs.zoom,
        fitMode: prefs.fitMode,
        contentScrollHeight,
      }),
    [
      viewportSize.width,
      viewportSize.height,
      prefs.deviceId,
      prefs.zoom,
      prefs.fitMode,
      contentScrollHeight,
    ],
  );

  return {
    viewportRef,
    prefs,
    metrics,
    contentScrollHeight,
    setContentScrollHeight,
    setDeviceId,
    setZoom,
    setFitMode,
  };
}
