import { useMemo } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { isAgentWorkflowBusy } from "@/core/agent/agentRunMutex";
import { APP_INFO } from "@/core/appInfo";

/**
 * Slim footer — live run context (Cursor-style).
 */
export function StatusBar() {
  const {
    project,
    buildRunning,
    pipelineRunning,
    planApplySession,
    aiPlanStatus,
    autoFixSession,
    greenfieldRun,
    agentGreenfieldPanelActive,
    providerStatus,
    verifyStatus,
    problemsStatus,
    lastEditedPath,
    activePath,
    dockOpen,
    toggleDock,
    openDock,
    setDockTab,
    setCommandPaletteOpen,
  } = useWorkspace();

  const agentBusy = useMemo(
    () =>
      isAgentWorkflowBusy({
        greenfieldRun,
        greenfieldPanelActive: agentGreenfieldPanelActive,
        buildRunning,
        pipelineRunning,
        aiPlanStatus,
        planApplyPhase: planApplySession?.phase ?? null,
        autoFixPhase: autoFixSession?.phase ?? null,
      }),
    [
      greenfieldRun,
      agentGreenfieldPanelActive,
      buildRunning,
      pipelineRunning,
      aiPlanStatus,
      planApplySession?.phase,
      autoFixSession?.phase,
    ],
  );

  const statusLabel = agentBusy
    ? null
    : verifyStatus === "running"
      ? "Verifying…"
      : problemsStatus.state === "scanning"
        ? "Checking types…"
        : project
          ? "Ready"
          : "Open a project";

  const contextLine = lastEditedPath ?? activePath ?? null;

  const openProblemsDock = () => {
    openDock();
    setDockTab("problems");
  };

  return (
    <footer className="statusbar">
      <button
        type="button"
        className="statusbar__btn"
        onClick={() => toggleDock()}
        title={dockOpen ? "Hide terminal dock" : "Show terminal dock"}
      >
        {dockOpen ? "▼ Terminal" : "▲ Terminal"}
      </button>
      {problemsStatus.errorCount > 0 ? (
        <button
          type="button"
          className="statusbar__problems statusbar__problems--error"
          onClick={openProblemsDock}
          title="Show problems"
        >
          {problemsStatus.errorCount} error{problemsStatus.errorCount === 1 ? "" : "s"}
        </button>
      ) : problemsStatus.warningCount > 0 ? (
        <button
          type="button"
          className="statusbar__problems statusbar__problems--warn"
          onClick={openProblemsDock}
          title="Show problems"
        >
          {problemsStatus.warningCount} warning
          {problemsStatus.warningCount === 1 ? "" : "s"}
        </button>
      ) : null}
      {statusLabel ? (
        <span className="statusbar__item" role="status">
          {statusLabel}
        </span>
      ) : null}
      {contextLine ? (
        <span className="statusbar__item statusbar__item--mono">{contextLine}</span>
      ) : null}
      {providerStatus ? (
        <span className="statusbar__item statusbar__item--muted">
          {providerStatus.pillText}
        </span>
      ) : null}
      <span className="statusbar__item statusbar__item--right">
        <button
          type="button"
          className="statusbar__link"
          onClick={() => setCommandPaletteOpen(true)}
        >
          ⌘⇧P
        </button>
        <span className="statusbar__sep">·</span>
        v{APP_INFO.version}
      </span>
    </footer>
  );
}
