import { useEffect, useRef } from "react";
import type { CenterTab } from "@/core/layout/types";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import {
  applyUserCenterTabPin,
  evaluateExecutionTabOnRunProgress,
  INITIAL_EXECUTION_TAB_SWITCH_STATE,
  resolveRunInProgress,
} from "@/app/workspace/executionDashboardTabPolicy";

export function useExecutionDashboardTab(opts: {
  readonly centerTab: CenterTab;
  readonly setCenterTab: (tab: CenterTab) => void;
  readonly greenfieldRun: GreenfieldRunSnapshot;
  readonly activeAgentRunId: string | null;
  readonly buildRunning: boolean;
  readonly pipelineRunning: boolean;
}) {
  const { centerTab, setCenterTab, greenfieldRun, activeAgentRunId, buildRunning, pipelineRunning } =
    opts;
  const switchStateRef = useRef(INITIAL_EXECUTION_TAB_SWITCH_STATE);

  const runInProgress = resolveRunInProgress({
    greenfieldRun,
    activeAgentRunId,
    buildRunning,
    pipelineRunning,
  });

  useEffect(() => {
    switchStateRef.current = applyUserCenterTabPin(switchStateRef.current, {
      runInProgress,
      centerTab,
    });
  }, [runInProgress, centerTab]);

  useEffect(() => {
    const result = evaluateExecutionTabOnRunProgress(switchStateRef.current, {
      runInProgress,
      centerTab,
    });
    switchStateRef.current = result.nextState;
    if (result.tabToSet && result.tabToSet !== centerTab) {
      setCenterTab(result.tabToSet);
    }
  }, [runInProgress, centerTab, setCenterTab]);
}
