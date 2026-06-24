import { syncOrchestrationHosts } from "@/app/workspace/syncOrchestrationHosts";
import type { SyncOrchestrationHostsInput } from "@/app/workspace/syncOrchestrationHosts";
import type { OrchestrationHostRefs } from "@/app/workspace/useOrchestrationHostRefs";

/** Refresh orchestration host refs each render from workspace state. */
export function useOrchestrationHostSync(
  refs: OrchestrationHostRefs,
  input: SyncOrchestrationHostsInput,
): void {
  syncOrchestrationHosts(refs, input);
}
