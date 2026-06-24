import { useLayoutEffect, useState, type RefObject } from "react";

export interface PreviewBoundsLayer {
  readonly label: string;
  readonly color: string;
  readonly ref: RefObject<HTMLElement | null>;
}

interface MeasuredBox {
  readonly label: string;
  readonly color: string;
  readonly top: number;
  readonly left: number;
  readonly width: number;
  readonly height: number;
}

interface PreviewBoundsOverlayProps {
  readonly shellRef: RefObject<HTMLElement | null>;
  readonly layers: readonly PreviewBoundsLayer[];
  readonly active: boolean;
}

/** Visualize toolbar / scroll / iframe rectangles for layout debugging. */
export function PreviewBoundsOverlay({
  shellRef,
  layers,
  active,
}: PreviewBoundsOverlayProps) {
  const [boxes, setBoxes] = useState<readonly MeasuredBox[]>([]);

  useLayoutEffect(() => {
    if (!active) {
      setBoxes([]);
      return;
    }

    const measure = () => {
      const shell = shellRef.current;
      if (!shell) {
        setBoxes([]);
        return;
      }
      const shellRect = shell.getBoundingClientRect();
      const next: MeasuredBox[] = [];
      for (const layer of layers) {
        const el = layer.ref.current;
        if (!el) continue;
        const r = el.getBoundingClientRect();
        next.push({
          label: layer.label,
          color: layer.color,
          top: r.top - shellRect.top + shell.scrollTop,
          left: r.left - shellRect.left + shell.scrollLeft,
          width: r.width,
          height: r.height,
        });
      }
      setBoxes(next);
    };

    measure();
    const ro = new ResizeObserver(measure);
    if (shellRef.current) ro.observe(shellRef.current);
    for (const layer of layers) {
      if (layer.ref.current) ro.observe(layer.ref.current);
    }
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [active, shellRef, layers]);

  if (!active || boxes.length === 0) return null;

  return (
    <div className="preview-bounds-overlay" aria-hidden="true">
      {boxes.map((box) => (
        <div
          key={box.label}
          className="preview-bounds-overlay__box"
          style={{
            top: box.top,
            left: box.left,
            width: box.width,
            height: box.height,
            borderColor: box.color,
            color: box.color,
          }}
        >
          <span className="preview-bounds-overlay__label">{box.label}</span>
        </div>
      ))}
    </div>
  );
}
