import { useCallback } from "react";
import {
  analyticsDedupeKey,
  appendAnalyticsRecord,
  buildAnalyticsRecord,
  emptyRunAnalyticsAccumulator,
  findAnalyticsRecord,
} from "@/core/analytics";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { CurrentRunAnalyticsAccumulator } from "@/core/analytics/recordRun";
import type { StudioAnalyticsRecord } from "@/core/analytics/types";

export function useWorkspaceAnalyticsActions(input: {
  readonly projectPath: string | undefined;
  readonly setAnalyticsHistory: React.Dispatch<
    React.SetStateAction<readonly StudioAnalyticsRecord[]>
  >;
  readonly setSelectedAnalyticsId: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setSelectedContextId: React.Dispatch<React.SetStateAction<string | null>>;
  readonly setRailToolState: React.Dispatch<
    React.SetStateAction<import("@/core/layout/types").RailTool>
  >;
  readonly currentRunAnalyticsRef: React.MutableRefObject<CurrentRunAnalyticsAccumulator>;
  readonly lastRecordedAnalyticsKeyRef: React.MutableRefObject<string | null>;
}) {
  const persistAnalyticsRecord = useCallback(
    (
      snapshot: GreenfieldRunSnapshot,
      ok: boolean,
      message: string,
      detail?: string,
    ) => {
      const dedupeKey = analyticsDedupeKey(snapshot, ok);
      if (input.lastRecordedAnalyticsKeyRef.current === dedupeKey) return;
      const record = buildAnalyticsRecord({
        snapshot,
        ok,
        message,
        ...(detail ? { detail } : {}),
        runAnalytics: input.currentRunAnalyticsRef.current,
      });
      if (!record) return;
      input.lastRecordedAnalyticsKeyRef.current = dedupeKey;
      input.currentRunAnalyticsRef.current = emptyRunAnalyticsAccumulator();
      input.setAnalyticsHistory(appendAnalyticsRecord(record));
    },
    [
      input.currentRunAnalyticsRef,
      input.lastRecordedAnalyticsKeyRef,
      input.setAnalyticsHistory,
    ],
  );

  const selectAnalyticsRecord = useCallback((id: string | null) => {
    input.setSelectedAnalyticsId(id);
  }, [input.setSelectedAnalyticsId]);

  const openAnalyticsFromDashboard = useCallback(
    (recordId: string) => {
      const record = findAnalyticsRecord(recordId, input.projectPath ?? null);
      if (!record?.contextSnapshotId) return;
      input.setSelectedContextId(record.contextSnapshotId);
      input.setRailToolState("context");
    },
    [input.projectPath, input.setSelectedContextId, input.setRailToolState],
  );

  return {
    persistAnalyticsRecord,
    selectAnalyticsRecord,
    openAnalyticsFromDashboard,
  };
}
