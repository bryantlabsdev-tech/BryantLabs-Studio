import { useState } from "react";
import {
  useBuildRunWorkspaceState,
  type BuildRunWorkspaceState,
} from "@/app/workspace/useBuildRunState";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";

export interface GreenfieldRunWorkspaceState extends BuildRunWorkspaceState {
  readonly agentGreenfieldPanelActive: boolean;
  readonly setAgentGreenfieldPanelActive: React.Dispatch<React.SetStateAction<boolean>>;
}

/** Greenfield run snapshot, controls, and panel coordination. */
export function useGreenfieldRun(): GreenfieldRunWorkspaceState {
  const buildRun = useBuildRunWorkspaceState();
  const [agentGreenfieldPanelActive, setAgentGreenfieldPanelActive] =
    useState(false);

  return {
    ...buildRun,
    agentGreenfieldPanelActive,
    setAgentGreenfieldPanelActive,
  };
}

export function isGreenfieldRunBusy(
  run: GreenfieldRunSnapshot,
  panelActive: boolean,
): boolean {
  if (panelActive) return true;
  if (run.genStatus === "running") return true;
  if (run.writeStatus === "writing") return true;
  if (run.runResult === "running") return true;
  return false;
}
