import { createContext, useContext } from "react";
import type { WorkspaceState } from "@/app/workspace/workspaceState";

/** Shared workspace context — keep in a tiny module so lazy chunks do not duplicate the provider. */
export const WorkspaceContext = createContext<WorkspaceState | null>(null);

export function useWorkspace(): WorkspaceState {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider");
  }
  return ctx;
}
