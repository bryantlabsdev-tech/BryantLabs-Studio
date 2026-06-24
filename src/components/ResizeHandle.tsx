import { useCallback, useRef } from "react";

export type ResizeHandleDirection = "column" | "row";

interface ResizeHandleProps {
  readonly direction: ResizeHandleDirection;
  readonly onResize: (deltaPx: number) => void;
  readonly onResizeEnd?: () => void;
  readonly onDoubleReset?: () => void;
  readonly "aria-label": string;
}

/**
 * Draggable splitter between workspace regions.
 */
export function ResizeHandle({
  direction,
  onResize,
  onResizeEnd,
  onDoubleReset,
  "aria-label": ariaLabel,
}: ResizeHandleProps) {
  const draggingRef = useRef(false);
  const lastRef = useRef({ x: 0, y: 0 });

  const endDrag = useCallback(
    (target: EventTarget | null, pointerId: number) => {
      if (!draggingRef.current) return;
      draggingRef.current = false;
      document.body.classList.remove("app--resizing");
      if (target && "releasePointerCapture" in target) {
        (target as HTMLElement).releasePointerCapture(pointerId);
      }
      onResizeEnd?.();
    },
    [onResizeEnd],
  );

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    e.preventDefault();
    draggingRef.current = true;
    lastRef.current = { x: e.clientX, y: e.clientY };
    document.body.classList.add("app--resizing");
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return;
    const dx = e.clientX - lastRef.current.x;
    const dy = e.clientY - lastRef.current.y;
    lastRef.current = { x: e.clientX, y: e.clientY };
    onResize(direction === "column" ? dx : dy);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    endDrag(e.currentTarget, e.pointerId);
  };

  const onPointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    endDrag(e.currentTarget, e.pointerId);
  };

  const onDoubleClick = () => {
    onDoubleReset?.();
  };

  return (
    <div
      role="separator"
      aria-orientation={direction === "column" ? "vertical" : "horizontal"}
      aria-label={ariaLabel}
      tabIndex={0}
      className={`resize-handle resize-handle--${direction}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onDoubleClick={onDoubleClick}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 24 : 8;
        if (direction === "column") {
          if (e.key === "ArrowLeft") {
            e.preventDefault();
            onResize(-step);
            onResizeEnd?.();
          } else if (e.key === "ArrowRight") {
            e.preventDefault();
            onResize(step);
            onResizeEnd?.();
          }
        } else if (e.key === "ArrowUp") {
          e.preventDefault();
          onResize(-step);
          onResizeEnd?.();
        } else if (e.key === "ArrowDown") {
          e.preventDefault();
          onResize(step);
          onResizeEnd?.();
        }
      }}
    />
  );
}
