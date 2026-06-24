import { useEffect, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import type { UtilityTab } from "@/core/layout/types";
import { PlanComparisonView } from "@/components/PlanComparisonView";
import { GreenfieldDebugPanel } from "@/components/views/GreenfieldDebugPanel";
import { EmptyState } from "@/components/EmptyState";
import {
  PROVIDERS,
  getProviderInfo,
  hasStoredApiKey,
  modelForProvider,
} from "@/core/providers";
import type { ProviderSettings } from "@/core/providers/types";

const TABS: ReadonlyArray<{ id: UtilityTab; label: string }> = [
  { id: "plan", label: "Plan" },
  { id: "debug", label: "Debug" },
  { id: "status", label: "Status" },
];

/**
 * Optional right utility column — plan details, debug, provider status.
 */
export function UtilityPanel() {
  const { plan, greenfieldRun } = useWorkspace();
  const [tab, setTab] = useState<UtilityTab>("plan");
  const [settings, setSettings] = useState<ProviderSettings | null>(null);

  useEffect(() => {
    const api = window.bryantlabs;
    if (!api) return;
    void api.getProviderSettings().then(setSettings);
  }, []);

  useEffect(() => {
    if (greenfieldRun.debug) setTab("debug");
  }, [greenfieldRun.debug]);

  useEffect(() => {
    if (plan) setTab("plan");
  }, [plan]);

  const provider = settings?.provider ?? "ollama";
  const info = getProviderInfo(provider);

  return (
    <section className="panel panel--utility" aria-label="Utilities">
      <header className="utility-tabs" role="tablist">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`utility-tabs__tab${tab === id ? " utility-tabs__tab--on" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </header>
      <div className="panel__body utility-panel__body">
        {tab === "plan" ? (
          plan ? (
            <PlanComparisonView plan={plan} />
          ) : (
            <EmptyState
              title="No plan"
              description="Use Plan in the left panel to analyze a change."
            />
          )
        ) : tab === "debug" ? (
          greenfieldRun.debug ? (
            <div className="utility-debug">
              <GreenfieldDebugPanel
                headline={greenfieldRun.debug.errorMessage}
                report={greenfieldRun.debug}
              />
            </div>
          ) : (
            <EmptyState
              title="No debug report"
              description="Debug details appear here when greenfield generation fails."
            />
          )
        ) : (
          <dl className="utility-status">
            <dt>Provider</dt>
            <dd>{PROVIDERS.find((p) => p.id === provider)?.label ?? provider}</dd>
            <dt>Model</dt>
            <dd>{settings ? modelForProvider(settings, provider) : "—"}</dd>
            {info.needsApiKey ? (
              <>
                <dt>{info.label} key</dt>
                <dd>
                  {settings && hasStoredApiKey(settings, provider)
                    ? "Stored"
                    : "Not set"}
                </dd>
              </>
            ) : null}
            {info.needsBaseUrl ? (
              <>
                <dt>Ollama URL</dt>
                <dd className="utility-status__mono">
                  {settings?.ollamaBaseUrl ?? "—"}
                </dd>
              </>
            ) : null}
            <dt>Run status</dt>
            <dd>{greenfieldRun.genStatus}</dd>
            <dt>{info.label}</dt>
            <dd className="utility-status__hint">Configure in Providers tool</dd>
          </dl>
        )}
      </div>
    </section>
  );
}
