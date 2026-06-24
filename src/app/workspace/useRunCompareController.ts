import { useCallback, useMemo, useState } from "react";

export interface RunCompareSession {
  readonly open: boolean;
  readonly runIds: readonly [string, string] | null;
}

export const EMPTY_RUN_COMPARE_SESSION: RunCompareSession = {
  open: false,
  runIds: null,
};

export function useRunCompareController() {
  const [compareRunIds, setCompareRunIds] = useState<string[]>([]);
  const [session, setSession] = useState<RunCompareSession>(EMPTY_RUN_COMPARE_SESSION);

  const toggleCompareRun = useCallback((runId: string) => {
    setCompareRunIds((prev) => {
      if (prev.includes(runId)) return prev.filter((id) => id !== runId);
      if (prev.length >= 2) return [prev[1]!, runId];
      return [...prev, runId];
    });
  }, []);

  const clearCompareRuns = useCallback(() => {
    setCompareRunIds([]);
  }, []);

  const openRunCompare = useCallback((leftRunId: string, rightRunId: string) => {
    setSession({ open: true, runIds: [leftRunId, rightRunId] });
  }, []);

  const openSelectedCompare = useCallback(() => {
    setCompareRunIds((prev) => {
      if (prev.length === 2) {
        setSession({ open: true, runIds: [prev[0]!, prev[1]!] });
      }
      return prev;
    });
  }, []);

  const closeRunCompare = useCallback(() => {
    setSession(EMPTY_RUN_COMPARE_SESSION);
  }, []);

  return useMemo(
    () => ({
      compareRunIds,
      compareSession: session,
      toggleCompareRun,
      clearCompareRuns,
      openRunCompare,
      openSelectedCompare,
      closeRunCompare,
    }),
    [
      compareRunIds,
      session,
      toggleCompareRun,
      clearCompareRuns,
      openRunCompare,
      openSelectedCompare,
      closeRunCompare,
    ],
  );
}
