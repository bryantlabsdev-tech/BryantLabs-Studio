import { ProvidersView } from "@/components/views/ProvidersView";
import { AgentExecutionPolicyPanel } from "@/components/views/AgentExecutionPolicyPanel";
import { SETTINGS_VIEW_TEST_ID } from "@/core/layout/settingsNavigation";
import { useEffect, useState } from "react";
import type { AgentExecutionDenialRecord, AgentExecutionPolicySnapshot } from "@/core/agent/agentExecutionPolicy";

/**
 * Settings shell — hosts provider configuration and the read-only Agent execution policy.
 */
export function SettingsView() {
  const api = typeof window !== "undefined" ? window.bryantlabs : undefined;
  const [snapshot, setSnapshot] = useState<AgentExecutionPolicySnapshot | null>(null);
  const [denials, setDenials] = useState<readonly AgentExecutionDenialRecord[]>([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const next = (await api?.getAgentExecutionPolicy?.()) ?? null;
        const nextDenials = (await api?.getAgentExecutionDenials?.()) ?? [];
        if (!cancelled) {
          setSnapshot(next);
          setDenials(nextDenials);
        }
      } catch {
        if (!cancelled) setSnapshot(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [api]);

  return (
    <div className="settings-view" data-testid={SETTINGS_VIEW_TEST_ID}>
      <ProvidersView />
      <AgentExecutionPolicyPanel snapshot={snapshot} denials={denials} />
    </div>
  );
}
