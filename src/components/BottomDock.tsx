import { useEffect } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import type { DockTab } from "@/core/layout/types";
import { ProblemsView } from "@/components/views/ProblemsView";
import { VerificationView } from "@/components/views/VerificationView";
import { TerminalView } from "@/components/views/TerminalView";
import { ViewSuspense } from "@/components/ViewSuspense";
import { LazyConsoleView } from "@/components/lazyViews";

const BASE_TABS: ReadonlyArray<{ id: DockTab; label: string }> = [
  { id: "problems", label: "Problems" },
  { id: "terminal", label: "Terminal" },
  { id: "verification", label: "Verification" },
];

const CONSOLE_TAB: { id: DockTab; label: string } = {
  id: "console",
  label: "Console",
};

/**
 * Bottom dock — problems, terminal, verification, and optional developer console.
 * Greenfield summary/logs live in the center workbench.
 */
export function BottomDock() {
  const {
    dockTab,
    setDockTab,
    verifyStatus,
    problemsStatus,
    developerConsoleEnabled,
    openDock,
  } = useWorkspace();

  const tabs = developerConsoleEnabled
    ? [...BASE_TABS, CONSOLE_TAB]
    : BASE_TABS;

  useEffect(() => {
    if (verifyStatus === "running") {
      openDock();
      if (dockTab !== "console") setDockTab("verification");
    }
  }, [verifyStatus, setDockTab, dockTab, openDock]);

  useEffect(() => {
    if (!developerConsoleEnabled && dockTab === "console") {
      setDockTab("problems");
    }
  }, [developerConsoleEnabled, dockTab, setDockTab]);

  const problemsBadge =
    problemsStatus.errorCount > 0
      ? problemsStatus.errorCount
      : problemsStatus.warningCount > 0
        ? problemsStatus.warningCount
        : 0;

  return (
    <section className="panel panel--dock" aria-label="Dev logs">
      <header className="dock-tabs" role="tablist">
        {tabs.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={dockTab === id}
            className={`dock-tabs__tab${dockTab === id ? " dock-tabs__tab--on" : ""}`}
            onClick={() => setDockTab(id)}
          >
            {label}
            {id === "problems" && problemsBadge > 0 ? (
              <span
                className={`dock-tabs__badge${
                  problemsStatus.errorCount > 0
                    ? " dock-tabs__badge--error"
                    : " dock-tabs__badge--warn"
                }`}
              >
                {problemsBadge}
              </span>
            ) : null}
          </button>
        ))}
      </header>
      <div className="panel__body dock__body">
        {dockTab === "problems" ? (
          <ProblemsView />
        ) : dockTab === "terminal" ? (
          <TerminalView />
        ) : dockTab === "console" ? (
          <ViewSuspense>
            <LazyConsoleView />
          </ViewSuspense>
        ) : (
          <VerificationView />
        )}
      </div>
    </section>
  );
}
