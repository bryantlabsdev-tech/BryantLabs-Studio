import { useCallback, useMemo, useState } from "react";
import type { RunInspectorTab } from "@/core/agent/runInspector";
import {
  EMPTY_RUN_INSPECTOR_SESSION,
  reduceRunInspectorSession,
  type RunInspectorSession,
} from "@/core/agent/runInspectorSession";

export function useRunInspectorController() {
  const [session, setSession] = useState<RunInspectorSession>(EMPTY_RUN_INSPECTOR_SESSION);

  const openRunInspector = useCallback((runId: string) => {
    setSession((prev) => reduceRunInspectorSession(prev, { type: "open_modal", runId }));
  }, []);

  const closeRunInspector = useCallback(() => {
    setSession((prev) => reduceRunInspectorSession(prev, { type: "close_modal" }));
  }, []);

  const setInspectorTab = useCallback((tab: RunInspectorTab) => {
    setSession((prev) => reduceRunInspectorSession(prev, { type: "set_tab", tab }));
  }, []);

  const setCenterInspectorActive = useCallback((runId: string | null) => {
    setSession((prev) =>
      reduceRunInspectorSession(prev, { type: "center_inspector_active", runId }),
    );
  }, []);

  const lockInspectorRun = useCallback((runId: string) => {
    setSession((prev) => reduceRunInspectorSession(prev, { type: "lock_run", runId }));
  }, []);

  return useMemo(
    () => ({
      inspectorSession: session,
      openRunInspector,
      closeRunInspector,
      setInspectorTab,
      setCenterInspectorActive,
      lockInspectorRun,
    }),
    [
      session,
      openRunInspector,
      closeRunInspector,
      setInspectorTab,
      setCenterInspectorActive,
      lockInspectorRun,
    ],
  );
}
