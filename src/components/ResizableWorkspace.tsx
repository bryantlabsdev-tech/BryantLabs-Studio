import { IconRail } from "@/components/IconRail";
import { WorkflowPanel } from "@/components/WorkflowPanel";
import { CenterWorkbench } from "@/components/CenterWorkbench";
import { AgentPanel } from "@/components/AgentPanel";
import { BottomDock } from "@/components/BottomDock";
import { ResizeHandle } from "@/components/ResizeHandle";
import { CommandPalette } from "@/components/CommandPalette";
import { useEffect } from "react";
import { usePanelLayout } from "@/hooks/usePanelLayout";

/**
 * Cursor-style workspace: icon rail | agent left | editor center | details right.
 */
export function ResizableWorkspace() {
  const {
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
    toggleDock,
    setDockOpen,
    toggleAgentFocus,
  } = usePanelLayout();

  useEffect(() => {
    const onToggle = () => toggleDock();
    const onOpen = () => setDockOpen(true);
    const onToggleAgentFocus = () => toggleAgentFocus();
    window.addEventListener("bryantlabs:toggle-dock", onToggle);
    window.addEventListener("bryantlabs:open-dock", onOpen);
    window.addEventListener("bryantlabs:toggle-agent-focus", onToggleAgentFocus);
    return () => {
      window.removeEventListener("bryantlabs:toggle-dock", onToggle);
      window.removeEventListener("bryantlabs:open-dock", onOpen);
      window.removeEventListener("bryantlabs:toggle-agent-focus", onToggleAgentFocus);
    };
  }, [toggleDock, setDockOpen, toggleAgentFocus]);

  return (
    <>
      <div ref={shellRef} className={`workspace-shell${layout.agentFocusMode ? " workspace-shell--agent-focus" : ""}`}>
        <div ref={columnsRef} className={`workspace${layout.agentFocusMode ? " workspace--agent-focus" : ""}`}>
          <IconRail />
          <div
            className="panel-slot panel-slot--left panel-slot--agent"
            style={{ width: layout.leftWidth }}
          >
            <AgentPanel />
          </div>
          <ResizeHandle
            direction="column"
            aria-label="Resize agent panel"
            onResize={adjustLeft}
            onResizeEnd={commitLayout}
            onDoubleReset={resetLeft}
          />
          <CenterWorkbench />
          {!layout.agentFocusMode ? (
            <>
          <ResizeHandle
            direction="column"
            aria-label="Resize details panel"
            onResize={adjustRight}
            onResizeEnd={commitLayout}
            onDoubleReset={resetRight}
          />
          <div
            className="panel-slot panel-slot--right panel-slot--details"
            style={{ width: layout.rightWidth }}
          >
            <WorkflowPanel />
          </div>
            </>
          ) : null}
        </div>
        {layout.dockOpen ? (
          <>
            <ResizeHandle
              direction="row"
              aria-label="Resize bottom dock"
              onResize={adjustDock}
              onResizeEnd={commitLayout}
              onDoubleReset={resetDock}
            />
            <div className="dock" style={{ height: layout.dockHeight }}>
              <BottomDock />
            </div>
          </>
        ) : (
          <button
            type="button"
            className="dock-collapsed-bar"
            onClick={() => toggleDock()}
            aria-label="Open terminal dock"
          >
            Terminal · Verification
          </button>
        )}
      </div>
      <CommandPalette />
    </>
  );
}
