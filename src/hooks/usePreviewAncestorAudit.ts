import { useLayoutEffect, useRef, useState, type RefObject } from "react";
import {
  auditPreviewAncestors,
  previewAncestorAuditsEqual,
  type PreviewAncestorAudit,
} from "@/core/preview/previewAncestorAudit";

export function usePreviewAncestorAudit(
  frameRef: RefObject<HTMLElement | null>,
  active: boolean,
  layoutKey = 0,
): PreviewAncestorAudit | null {
  const [audit, setAudit] = useState<PreviewAncestorAudit | null>(null);
  const rafRef = useRef(0);

  useLayoutEffect(() => {
    if (!active) {
      setAudit((prev) => (prev === null ? prev : null));
      return;
    }

    const run = () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        rafRef.current = 0;
        const next = auditPreviewAncestors(frameRef.current);
        setAudit((prev) => (previewAncestorAuditsEqual(prev, next) ? prev : next));
        if (import.meta.env.DEV && next.collapseAt) {
          console.info("[preview layout audit]", next.collapseReason);
        }
      });
    };

    run();
    const ro = new ResizeObserver(run);
    const frame = frameRef.current;
    if (frame) {
      ro.observe(frame);
      let node: HTMLElement | null = frame.parentElement;
      let n = 0;
      while (node && n < 14) {
        ro.observe(node);
        if (node.classList.contains("app")) break;
        node = node.parentElement;
        n += 1;
      }
    }
    window.addEventListener("resize", run);
    const t = window.setTimeout(run, 250);

    return () => {
      ro.disconnect();
      window.removeEventListener("resize", run);
      window.clearTimeout(t);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [active, layoutKey, frameRef]);

  return audit;
}
