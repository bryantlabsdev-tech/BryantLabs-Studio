import { useState } from "react";
import {
  loadPreviewDebugLayers,
  savePreviewDebugLayers,
} from "@/core/preview/viewport";
import { enableAdvancedPreviewControls } from "@/core/preview/viewport";
import { PreviewViewportToolbar } from "@/components/preview/PreviewViewportToolbar";
import { usePreviewViewport } from "@/hooks/usePreviewViewport";

/** Viewport toolbar + hook; mount only when {@link enableAdvancedPreviewControls}. */
export function PreviewViewportControlsBar() {
  const [showDebugLayers, setShowDebugLayers] = useState(loadPreviewDebugLayers);
  const { prefs, setDeviceId, setZoom, setFitMode } = usePreviewViewport();

  return (
    <PreviewViewportToolbar
      deviceId={prefs.deviceId}
      zoom={prefs.zoom}
      fitMode={prefs.fitMode}
      showDebugLayers={showDebugLayers}
      onDeviceChange={setDeviceId}
      onZoomChange={setZoom}
      onFitModeChange={setFitMode}
      onDebugLayersChange={(on) => {
        setShowDebugLayers(on);
        savePreviewDebugLayers(on);
      }}
    />
  );
}
