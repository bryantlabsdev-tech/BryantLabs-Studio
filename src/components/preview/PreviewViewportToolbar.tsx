import {
  PREVIEW_DEVICE_OPTIONS,
  type PreviewDeviceId,
  type PreviewFitMode,
  type PreviewZoomLevel,
} from "@/core/preview/viewport";

interface PreviewViewportToolbarProps {
  readonly deviceId: PreviewDeviceId;
  readonly zoom: PreviewZoomLevel;
  readonly fitMode: PreviewFitMode;
  readonly showDebugLayers: boolean;
  readonly onDeviceChange: (id: PreviewDeviceId) => void;
  readonly onZoomChange: (zoom: PreviewZoomLevel) => void;
  readonly onFitModeChange: (mode: PreviewFitMode) => void;
  readonly onDebugLayersChange: (on: boolean) => void;
}

const FIT_BUTTONS: ReadonlyArray<{
  readonly mode: PreviewFitMode;
  readonly label: string;
}> = [
  { mode: "fit-width", label: "Fit width" },
  { mode: "fit-height", label: "Fit height" },
  { mode: "actual-size", label: "Actual size" },
];

const ZOOM_BUTTONS: ReadonlyArray<{
  readonly zoom: PreviewZoomLevel;
  readonly label: string;
}> = [
  { zoom: 0.75, label: "Zoom 75%" },
  { zoom: 1, label: "Zoom 100%" },
  { zoom: 1.25, label: "Zoom 125%" },
];

export function PreviewViewportToolbar({
  deviceId,
  zoom,
  fitMode,
  showDebugLayers,
  onDeviceChange,
  onZoomChange,
  onFitModeChange,
  onDebugLayersChange,
}: PreviewViewportToolbarProps) {
  return (
    <div
      className="preview-panel__viewport-bar"
      role="toolbar"
      aria-label="Preview viewport controls"
    >
      <label className="preview-panel__viewport-label">
        Device
        <select
          className="preview-panel__viewport-select"
          value={deviceId}
          onChange={(e) => onDeviceChange(e.target.value as PreviewDeviceId)}
          aria-label="Preview device size"
        >
          {PREVIEW_DEVICE_OPTIONS.map(({ id, label }) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
      </label>

      <span className="preview-panel__viewport-divider" aria-hidden="true" />

      {FIT_BUTTONS.map(({ mode, label }) => (
        <button
          key={mode}
          type="button"
          className={`preview-panel__viewport-btn${fitMode === mode ? " preview-panel__viewport-btn--on" : ""}`}
          aria-pressed={fitMode === mode}
          onClick={() => onFitModeChange(mode)}
        >
          {label}
        </button>
      ))}

      <span className="preview-panel__viewport-divider" aria-hidden="true" />

      {ZOOM_BUTTONS.map(({ zoom: z, label }) => (
        <button
          key={z}
          type="button"
          className={`preview-panel__viewport-btn${zoom === z ? " preview-panel__viewport-btn--on" : ""}`}
          aria-pressed={zoom === z}
          onClick={() => onZoomChange(z)}
        >
          {label}
        </button>
      ))}

      <span className="preview-panel__viewport-divider" aria-hidden="true" />

      <label className="preview-panel__viewport-label preview-panel__viewport-label--check">
        <input
          type="checkbox"
          checked={showDebugLayers}
          onChange={(e) => onDebugLayersChange(e.target.checked)}
        />
        Show preview layers
      </label>
    </div>
  );
}
