import { useLayoutEffect, type RefObject } from "react";
import {
  applyPreviewFrameLayout,
  clearPreviewFrameLayout,
  collectPreviewHeightChain,
  logPreviewHeightChain,
  measurePreviewFrameLayout,
} from "@/core/preview/previewFrameLayout";

export interface UsePreviewFrameSizeOptions {
  readonly containerRef: RefObject<HTMLDivElement | null>;
  readonly frameRef: RefObject<HTMLElement | null>;
  readonly previewRootRef?: RefObject<HTMLDivElement | null>;
  readonly toolbarRef?: RefObject<HTMLDivElement | null>;
  readonly mainRef?: RefObject<HTMLDivElement | null>;
  readonly active: boolean;
  readonly layoutKey?: number;
}

/**
 * Electron `<webview>` ignores flex / height:100% and defaults to ~150px unless
 * given explicit pixel dimensions. iframe gets the same treatment for consistency.
 */
export function usePreviewFrameSize({
  containerRef,
  frameRef,
  previewRootRef,
  toolbarRef,
  mainRef,
  active,
  layoutKey = 0,
}: UsePreviewFrameSizeOptions): void {
  useLayoutEffect(() => {
    if (!active) return;

    const observed = new Set<Element>();
    let raf = 0;
    let retryTimer = 0;
    let lateTimer = 0;
    let disposed = false;

    const apply = () => {
      if (disposed) return;
      const container = containerRef.current;
      const frame = frameRef.current;
      if (!container || !frame) return;

      const size = measurePreviewFrameLayout({
        container,
        frame,
        main: mainRef?.current ?? null,
      });
      if (!size) return;

      applyPreviewFrameLayout({ container, frame, main: mainRef?.current ?? null }, size);

      logPreviewHeightChain(
        collectPreviewHeightChain({
          container,
          frame,
          previewRoot: previewRootRef?.current ?? null,
          toolbar: toolbarRef?.current ?? null,
          main: mainRef?.current ?? null,
        }),
      );
    };

    const resizeObserver = new ResizeObserver(() => apply());

    const observe = (el: Element | null | undefined) => {
      if (!el || observed.has(el)) return;
      observed.add(el);
      resizeObserver.observe(el);
    };

    const scheduleRetries = () => {
      let n = 0;
      const tick = () => {
        apply();
        if (++n < 12) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
      window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(apply, 350);
      window.clearTimeout(lateTimer);
      lateTimer = window.setTimeout(apply, 900);
    };

    apply();
    scheduleRetries();

    observe(containerRef.current);
    observe(mainRef?.current);
    observe(previewRootRef?.current);
    observe(toolbarRef?.current);
    observe(previewRootRef?.current?.closest(".center-panel__body"));
    observe(previewRootRef?.current?.closest(".panel.panel--center"));
    observe(previewRootRef?.current?.closest(".view-suspense"));

    window.addEventListener("resize", apply);

    return () => {
      disposed = true;
      resizeObserver.disconnect();
      window.removeEventListener("resize", apply);
      cancelAnimationFrame(raf);
      window.clearTimeout(retryTimer);
      window.clearTimeout(lateTimer);
      const container = containerRef.current;
      const frame = frameRef.current;
      if (container && frame) {
        clearPreviewFrameLayout({ container, frame, main: mainRef?.current ?? null });
      }
    };
  }, [
    active,
    layoutKey,
    containerRef,
    frameRef,
    previewRootRef,
    toolbarRef,
    mainRef,
  ]);
}
