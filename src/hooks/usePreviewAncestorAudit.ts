import { useLayoutEffect, useState, type RefObject } from "react";
import {
  auditPreviewAncestors,
  type PreviewAncestorAudit,
} from "@/core/preview/previewAncestorAudit";

export function usePreviewAncestorAudit(
  frameRef: RefObject<HTMLElement | null>,
  active: boolean,
  layoutKey = 0,
): PreviewAncestorAudit | null {
  const [audit, setAudit] = useState<PreviewAncestorAudit | null>(null);

  useLayoutEffect(() => {
    if (!active) {
      setAudit(null);
      return;
    }

    const run = () => {
      const next = auditPreviewAncestors(frameRef.current);
      setAudit(next);
      if (import.meta.env.DEV) {
        console.table(next.rows);
        if (next.collapseAt) {
          console.info("[preview layout audit]", next.collapseReason);
        }
      }
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
    };
  }, [active, layoutKey, frameRef]);

  return audit;
}
