import { useCallback, useEffect, useRef, useState } from "react";
import {
  clampDockHeight,
  clampLeftWidth,
  clampPanelLayout,
  clampRightWidth,
  layoutForAgentFocus,
  loadPanelLayout,
  PANEL_LAYOUT_DEFAULTS,
  PANEL_LAYOUT_LIMITS,
  savePanelLayout,
  type PanelLayout,
} from "@/core/layout/panelLayout";

export function usePanelLayout() {
  const [layout, setLayout] = useState<PanelLayout>(() => {
    const loaded = loadPanelLayout();
    return loaded;
  });
  const shellRef = useRef<HTMLDivElement>(null);
  const columnsRef = useRef<HTMLDivElement>(null);
  const preFocusLayoutRef = useRef<Pick<PanelLayout, "leftWidth" | "rightWidth"> | null>(
    null,
  );

  useEffect(() => {
    if (!layout.agentFocusMode) return;
    const columns = columnsRef.current;
    if (!columns) return;
    setLayout((prev) => {
      if (!prev.agentFocusMode) return prev;
      const next = layoutForAgentFocus(prev, columns.clientWidth);
      if (
        next.leftWidth === prev.leftWidth &&
        next.rightWidth === prev.rightWidth
      ) {
        return prev;
      }
      savePanelLayout(next);
      return next;
    });
  }, [layout.agentFocusMode]);

  const commitLayout = useCallback(() => {
    setLayout((current) => {
      const next = clampPanelLayout(current);
      savePanelLayout(next);
      return next;
    });
  }, []);

  const adjustLeft = useCallback((delta: number) => {
    setLayout((prev) => {
      const columns = columnsRef.current;
      const nextLeft = columns
        ? clampLeftWidth(prev, columns.clientWidth, prev.leftWidth + delta)
        : prev.leftWidth + delta;
      return clampPanelLayout({ ...prev, leftWidth: nextLeft });
    });
  }, []);

  const adjustRight = useCallback((delta: number) => {
    setLayout((prev) => {
      const columns = columnsRef.current;
      const nextRight = columns
        ? clampRightWidth(prev, columns.clientWidth, prev.rightWidth - delta)
        : prev.rightWidth - delta;
      return clampPanelLayout({ ...prev, rightWidth: nextRight });
    });
  }, []);

  const adjustDock = useCallback((delta: number) => {
    setLayout((prev) => {
      const shell = shellRef.current;
      const nextDock = shell
        ? clampDockHeight(shell.clientHeight, prev.dockHeight + delta)
        : prev.dockHeight + delta;
      const next = clampPanelLayout({ ...prev, dockHeight: nextDock });
      savePanelLayout(next);
      return next;
    });
  }, []);

  const resetLeft = useCallback(() => {
    setLayout((prev) => {
      const next = clampPanelLayout({
        ...prev,
        leftWidth: PANEL_LAYOUT_DEFAULTS.leftWidth,
      });
      savePanelLayout(next);
      return next;
    });
  }, []);

  const resetRight = useCallback(() => {
    setLayout((prev) => {
      const next = clampPanelLayout({
        ...prev,
        rightWidth: PANEL_LAYOUT_DEFAULTS.rightWidth,
      });
      savePanelLayout(next);
      return next;
    });
  }, []);

  const resetDock = useCallback(() => {
    setLayout((prev) => {
      const next = clampPanelLayout({
        ...prev,
        dockHeight: PANEL_LAYOUT_DEFAULTS.dockHeight,
        dockOpen: true,
      });
      savePanelLayout(next);
      return next;
    });
  }, []);

  const notifyDockChanged = () => {
    window.dispatchEvent(new CustomEvent("bryantlabs:dock-changed"));
  };

  const setDockOpen = useCallback((open: boolean) => {
    setLayout((prev) => {
      if (prev.dockOpen === open) return prev;
      const next = clampPanelLayout({
        ...prev,
        dockOpen: open,
        dockHeight: open
          ? prev.dockHeight > 0
            ? prev.dockHeight
            : PANEL_LAYOUT_DEFAULTS.dockHeight
          : 0,
      });
      savePanelLayout(next);
      notifyDockChanged();
      return next;
    });
  }, []);

  const toggleDock = useCallback(() => {
    setLayout((prev) => {
      const opening = !prev.dockOpen;
      const next = clampPanelLayout({
        ...prev,
        dockOpen: opening,
        dockHeight: opening
          ? prev.dockHeight > 0
            ? prev.dockHeight
            : PANEL_LAYOUT_DEFAULTS.dockHeight
          : 0,
      });
      savePanelLayout(next);
      notifyDockChanged();
      return next;
    });
  }, []);

  const toggleAgentFocus = useCallback(() => {
    setLayout((prev) => {
      const columns = columnsRef.current;
      if (prev.agentFocusMode) {
        const restore = preFocusLayoutRef.current;
        preFocusLayoutRef.current = null;
        const next = clampPanelLayout({
          ...prev,
          agentFocusMode: false,
          leftWidth: restore?.leftWidth ?? PANEL_LAYOUT_DEFAULTS.leftWidth,
          rightWidth: restore?.rightWidth ?? PANEL_LAYOUT_DEFAULTS.rightWidth,
        });
        savePanelLayout(next);
        window.dispatchEvent(
          new CustomEvent("bryantlabs:agent-focus-changed", {
            detail: { agentFocusMode: false },
          }),
        );
        return next;
      }
      preFocusLayoutRef.current = {
        leftWidth: prev.leftWidth,
        rightWidth: prev.rightWidth,
      };
      const next = columns
        ? layoutForAgentFocus(prev, columns.clientWidth)
        : clampPanelLayout({ ...prev, agentFocusMode: true, leftWidth: 520, rightWidth: PANEL_LAYOUT_LIMITS.rightMin });
      savePanelLayout(next);
      window.dispatchEvent(
        new CustomEvent("bryantlabs:agent-focus-changed", {
          detail: { agentFocusMode: next.agentFocusMode },
        }),
      );
      return next;
    });
  }, []);

  return {
    layout,
    shellRef,
    columnsRef,
    adjustLeft,
    adjustRight,
    adjustDock,
    commitLayout,
    resetLeft,
    resetRight,
    resetDock,
    setDockOpen,
    toggleDock,
    toggleAgentFocus,
  };
}
