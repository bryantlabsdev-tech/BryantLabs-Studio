import { useEffect, useState } from "react";
import { ProviderReliabilityDiagnostics } from "@/components/ProviderReliabilityDiagnostics";
import {
  PROVIDERS,
  getProviderInfo,
  modelForProvider,
  patchModelForProvider,
  PROVIDER_CONNECTION_LABELS,
  readProviderLocalPreferences,
  rememberProviderSelection,
  providerUsesDynamicModels,
  providerUsesCuratedModels,
  resolveDiscoveredModel,
  formatOllamaModelOptionLabel,
  installedModelsLabel,
  buildProviderSettingsSavePayload,
  apiKeyPreviewForProvider,
  apiKeyClearPayload,
  apiKeySavedNote,
  apiKeyClearedNote,
  shouldPersistApiKeyDraft,
  type HealthResult,
  type ProviderId,
  type ProviderResponse,
  type AutoFixMode,
  type FileWriteMode,
  type ProviderSettings,
  type ProviderConnectionStatus,
  type AgentMode,
  normalizeProviderSettings,
  patchStageModel,
  patchStageProvider,
  stageModelValue,
  isPipelineMode,
  formatProviderRoutingSummary,
  formatFallbackPolicy,
  MAX_AI_CALLS_DEFAULT,
  MAX_REPAIR_ATTEMPTS_DEFAULT,
  DEFAULT_PLANNER_MAX_OUTPUT_TOKENS,
  MIN_PLANNER_MAX_OUTPUT_TOKENS,
  MAX_PLANNER_MAX_OUTPUT_TOKENS,
} from "@/core/providers";
import {
  formatConnectionFailureMessage,
  globalProviderSelectionPatch,
} from "@/core/providers/providerDiagnostics";
import { healthToReliabilityStatus } from "@/core/providers/reliability";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { EmptyState } from "@/components/EmptyState";
import {
  ProviderApiKeyField,
  ProviderConnectionTest,
} from "@/components/views/ProviderApiKeyField";
import { CuratedProviderModelSelect } from "@/components/views/CuratedProviderModelSelect";

type Phase = "idle" | "loading" | "done" | "error";

/**
 * Providers panel (Phase 7). Read-only model communication: choose a provider
 * and model, store settings locally, run health checks, and send a single test
 * prompt. There is NO project context, NO generation, and NO editing here.
 */
export function ProvidersView() {
  const api = window.bryantlabs;
  const { refreshProviderStatus } = useWorkspace();
  const [settings, setSettings] = useState<ProviderSettings | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState("");
  const [saving, setSaving] = useState(false);
  const [savedNote, setSavedNote] = useState<string | null>(null);

  const [health, setHealth] = useState<HealthResult | null>(null);
  const [healthPhase, setHealthPhase] = useState<Phase>("idle");
  const [discoveredModels, setDiscoveredModels] = useState<string[]>([]);
  const [modelsRefreshing, setModelsRefreshing] = useState(false);

  const [prompt, setPrompt] = useState("Hello");
  const [response, setResponse] = useState<ProviderResponse | null>(null);
  const [testPhase, setTestPhase] = useState<Phase>("idle");
  const [connectionTestNote, setConnectionTestNote] = useState<string | null>(null);
  const [connectionTestPhase, setConnectionTestPhase] = useState<Phase>("idle");

  useEffect(() => {
    if (!api) return;
    void api.getProviderSettings().then((loaded) => {
      const prefs = readProviderLocalPreferences();
      const merged: ProviderSettings = normalizeProviderSettings({
        ...loaded,
        provider: prefs.provider ?? loaded.provider,
        geminiModel: prefs.geminiModel ?? loaded.geminiModel,
        ollamaModel: prefs.ollamaModel ?? loaded.ollamaModel,
        anthropicModel: prefs.anthropicModel ?? loaded.anthropicModel,
        groqModel: prefs.groqModel ?? loaded.groqModel,
        openrouterModel: prefs.openrouterModel ?? loaded.openrouterModel,
      });
      setSettings(merged);
      setApiKeyInput("");
    });
  }, [api]);

  useEffect(() => {
    setApiKeyInput("");
  }, [settings?.provider]);

  const applyDiscoveredModels = async (
    targetProvider: ProviderId,
    models: string[],
    baseSettings: ProviderSettings,
  ) => {
    setDiscoveredModels(models);
    if (models.length === 0) return;

    const resolved = resolveDiscoveredModel(
      targetProvider,
      modelForProvider(baseSettings, targetProvider),
      models,
    );
    const patch = patchModelForProvider(targetProvider, resolved);
    setSettings((s) => (s ? { ...s, ...patch } : s));
    rememberProviderSelection(targetProvider, resolved);
    try {
      await api!.saveProviderSettings(patch);
      void refreshProviderStatus();
    } catch {
      // UI still reflects selection; user can Save settings again.
    }
  };

  const runHealth = async (
    targetProvider: ProviderId,
    currentSettings: ProviderSettings,
    opts?: { modelsOnly?: boolean },
  ) => {
    if (opts?.modelsOnly) {
      setModelsRefreshing(true);
    } else {
      setHealthPhase("loading");
      setHealth(null);
    }
    try {
      const res = await api!.checkProviderHealth(targetProvider);
      if (!opts?.modelsOnly) {
        setHealth(res);
        setHealthPhase("done");
      }
      if (res.models?.length && targetProvider !== "gemini") {
        await applyDiscoveredModels(targetProvider, res.models, currentSettings);
      }
    } catch {
      if (!opts?.modelsOnly) setHealthPhase("error");
    } finally {
      if (opts?.modelsOnly) setModelsRefreshing(false);
      void refreshProviderStatus();
    }
  };

  const refreshModels = async (currentSettings: ProviderSettings) => {
    if (!providerUsesDynamicModels(currentSettings.provider)) return;
    setDiscoveredModels([]);
    await runHealth(currentSettings.provider, currentSettings, {
      modelsOnly: true,
    });
  };

  useEffect(() => {
    if (!api || !settings) return;
    if (discoveredModels.length > 0) return;

    if (settings.provider === "gemini" && settings.hasGeminiKey) {
      void runHealth("gemini", settings);
      return;
    }

    if (
      settings.provider === "anthropic" &&
      settings.hasAnthropicKey
    ) {
      void runHealth("anthropic", settings);
      return;
    }

    if (
      (settings.provider === "groq" && settings.hasGroqKey) ||
      (settings.provider === "openrouter" && settings.hasOpenRouterKey)
    ) {
      void runHealth(settings.provider, settings);
      return;
    }

    if (
      settings.provider === "ollama" &&
      settings.ollamaBaseUrl.trim().length > 0
    ) {
      void runHealth("ollama", settings);
    }
  }, [
    api,
    settings?.provider,
    settings?.hasGeminiKey,
    settings?.hasAnthropicKey,
    settings?.hasGroqKey,
    settings?.hasOpenRouterKey,
    settings?.ollamaBaseUrl,
    discoveredModels.length,
  ]);

  if (!api) {
    return (
      <div className="providers__empty">
        <EmptyState
          title="Desktop only"
          description="Provider communication runs in the desktop app's main process. Launch BryantLabs Studio with Electron to configure and test providers."
        />
      </div>
    );
  }

  if (!settings) {
    return <p className="providers__hint">Loading provider settings…</p>;
  }

  const provider = settings.provider;
  const info = getProviderInfo(provider);
  const activeModel = modelForProvider(settings, provider);
  const usesDynamicModels = providerUsesDynamicModels(provider);
  const usesCuratedModels = providerUsesCuratedModels(provider);
  const modelOptions = usesDynamicModels
    ? discoveredModels
    : info.suggestedModels;

  const update = (patch: Partial<ProviderSettings>) => {
    setSettings((s) => (s ? { ...s, ...patch } : s));
    setSavedNote(null);
  };

  const persistSettingsPatch = async (patch: Partial<ProviderSettings>) => {
    update(patch);
    try {
      const next = await api.saveProviderSettings(patch);
      setSettings(next);
      void refreshProviderStatus();
    } catch {
      setSavedNote("Failed to save settings.");
    }
  };

  const persistModelSelection = async (model: string) => {
    const basePatch = patchModelForProvider(provider, model);
    const patch: Partial<ProviderSettings> =
      provider === "gemini"
        ? {
            ...basePatch,
            plannerModel: model,
            coderModel: model,
            repairModel: model,
          }
        : basePatch;
    rememberProviderSelection(provider, model);
    await persistSettingsPatch(patch);
    console.log(
      `[provider:selected] provider=${provider} model=${model} source=settings`,
    );
  };

  const selectModel = (model: string) => {
    void persistModelSelection(model);
  };

  const geminiAvailableModelIds =
    provider === "gemini" && health?.provider === "gemini" && health.models
      ? health.models
      : undefined;

  const save = async () => {
    setSaving(true);
    setSavedNote(null);
    const keyDraft = apiKeyInput;
    const preview = apiKeyPreviewForProvider(settings, provider);
    const savingNewKey = shouldPersistApiKeyDraft(keyDraft, preview);
    try {
      const payload = buildProviderSettingsSavePayload(settings, keyDraft);
      const next = await api.saveProviderSettings(payload);
      setSettings(next);
      setApiKeyInput("");
      rememberProviderSelection(provider, modelForProvider(next, provider));
      if (savingNewKey) {
        setSavedNote(apiKeySavedNote(provider));
      } else {
        setSavedNote("Settings saved locally.");
      }
      void refreshProviderStatus();
    } catch {
      setSavedNote("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const persistProviderSwitch = async (nextProvider: ProviderId) => {
    try {
      const patch = globalProviderSelectionPatch(
        nextProvider,
        settings ? modelForProvider(settings, nextProvider) : undefined,
      );
      const next = await api.saveProviderSettings(patch);
      setSettings(next);
      rememberProviderSelection(nextProvider, modelForProvider(next, nextProvider));
      console.log(
        `[provider:selected] provider=${nextProvider} model=${modelForProvider(next, nextProvider)} source=settings stage=global`,
      );
      void refreshProviderStatus();
    } catch {
      setSavedNote("Failed to save provider selection.");
    }
  };

  const testProviderConnection = async () => {
    if (!settings) return;
    setConnectionTestPhase("loading");
    setConnectionTestNote(null);
    try {
      const result = await api.checkProviderHealth(provider);
      setHealth(result);
      setHealthPhase("done");
      const status = healthToReliabilityStatus(result, settings, provider);
      if (result.ok) {
        setConnectionTestNote(`Connected · ${provider} · ${result.model}`);
        console.log(
          `[provider:connection] provider=${provider} model=${result.model} ok=true`,
        );
      } else {
        const message = formatConnectionFailureMessage(
          status,
          provider,
          result.error,
        );
        setConnectionTestNote(message);
        console.error(
          `[provider:error] status=${status} message=${result.error ?? "health check failed"} provider=${provider} model=${result.model} apiKeyPresent=${getProviderInfo(provider).needsApiKey ? (provider === "gemini" ? settings.hasGeminiKey : provider === "anthropic" ? settings.hasAnthropicKey : provider === "groq" ? settings.hasGroqKey : settings.hasOpenRouterKey) : true}`,
        );
      }
      setConnectionTestPhase(result.ok ? "done" : "error");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Connection test failed";
      setConnectionTestNote(message);
      setConnectionTestPhase("error");
      console.error(`[provider:error] message=${message} provider=${provider}`);
    }
  };

  const clearApiKey = async () => {
    if (!getProviderInfo(provider).needsApiKey) return;
    setSaving(true);
    setSavedNote(null);
    try {
      const payload = apiKeyClearPayload(provider);
      const next = await api.saveProviderSettings(payload);
      setSettings(next);
      setApiKeyInput("");
      setSavedNote(apiKeyClearedNote(provider));
      if (providerUsesDynamicModels(provider)) setDiscoveredModels([]);
    } catch {
      setSavedNote("Failed to clear API key.");
    } finally {
      setSaving(false);
    }
  };

  const runTest = async () => {
    setTestPhase("loading");
    setResponse(null);
    try {
      const res = await api.testProvider(provider, prompt);
      setResponse(res);
      setTestPhase("done");
    } catch {
      setTestPhase("error");
    }
  };

  const connectionStatus: ProviderConnectionStatus | null =
    health?.connectionStatus ??
    (health
      ? health.ok
        ? "connected"
        : "unknown"
      : null);

  return (
    <div className="providers">
      <div className="prov-strip">
        <Field label="Provider" value={info.label} />
        <Field
          label="Model"
          value={(response?.model ?? health?.model ?? activeModel) || "—"}
        />
        {connectionStatus ? (
          <Field
            label="Status"
            value={PROVIDER_CONNECTION_LABELS[connectionStatus]}
          />
        ) : null}
      </div>

      <section className="prov-block">
        <h3 className="prov-heading">Agent mode</h3>
        <p className="prov-hint">
          Single Agent uses one provider for everything. Multi-Agent Pipeline routes
          Planner, Coder, and Repair separately — Verifier stays local and free.
        </p>
        <label className="prov-label" htmlFor="prov-agent-mode">
          Agent mode
        </label>
        <select
          id="prov-agent-mode"
          className="prov-input"
          value={settings.agentMode ?? "single"}
          onChange={(e) => update({ agentMode: e.target.value as AgentMode })}
        >
          <option value="single">Single Agent</option>
          <option value="pipeline">Multi-Agent Pipeline</option>
        </select>

        {isPipelineMode(settings) ? (
          <div className="prov-stage-grid">
            <StageRouteField
              label="Planner"
              provider={settings.plannerProvider ?? settings.provider}
              model={
                stageModelValue(settings, "planner") ||
                modelForProvider(settings, settings.plannerProvider ?? settings.provider)
              }
              geminiAvailableModelIds={geminiAvailableModelIds}
              onProvider={(p) => update(patchStageProvider("planner", p))}
              onModel={(m) => void persistSettingsPatch(patchStageModel("planner", m))}
            />
            <StageRouteField
              label="Coder"
              provider={settings.coderProvider ?? settings.provider}
              model={
                stageModelValue(settings, "coder") ||
                modelForProvider(settings, settings.coderProvider ?? settings.provider)
              }
              geminiAvailableModelIds={geminiAvailableModelIds}
              onProvider={(p) => update(patchStageProvider("coder", p))}
              onModel={(m) => void persistSettingsPatch(patchStageModel("coder", m))}
            />
            <StageRouteField
              label="Repair"
              provider={settings.repairProvider ?? settings.provider}
              model={
                stageModelValue(settings, "repair") ||
                modelForProvider(settings, settings.repairProvider ?? settings.provider)
              }
              geminiAvailableModelIds={geminiAvailableModelIds}
              onProvider={(p) => update(patchStageProvider("repair", p))}
              onModel={(m) => void persistSettingsPatch(patchStageModel("repair", m))}
            />
            <Field label="Verifier" value="Local only" />
          </div>
        ) : (
          <div className="prov-strip prov-strip--compact">
            <Field label="Provider" value={info.label} />
            <Field label="Model" value={activeModel || "—"} />
          </div>
        )}

        <p className="prov-hint prov-hint--routing">
          {formatProviderRoutingSummary(settings)}
        </p>
      </section>

      <section className="prov-block">
        <h3 className="prov-heading">Cost controls</h3>
        <label className="prov-label" htmlFor="prov-max-calls">
          Max AI calls per run
        </label>
        <input
          id="prov-max-calls"
          className="prov-input"
          type="number"
          min={1}
          max={50}
          value={settings.maxAiCalls ?? MAX_AI_CALLS_DEFAULT}
          onChange={(e) =>
            update({ maxAiCalls: Math.max(1, Number(e.target.value) || 1) })
          }
        />
        <label className="prov-label" htmlFor="prov-planner-max-output">
          Planner max output tokens
        </label>
        <input
          id="prov-planner-max-output"
          className="prov-input"
          type="number"
          min={MIN_PLANNER_MAX_OUTPUT_TOKENS}
          max={MAX_PLANNER_MAX_OUTPUT_TOKENS}
          step={512}
          value={settings.plannerMaxOutputTokens ?? DEFAULT_PLANNER_MAX_OUTPUT_TOKENS}
          onChange={(e) =>
            update({
              plannerMaxOutputTokens: Math.max(
                MIN_PLANNER_MAX_OUTPUT_TOKENS,
                Math.min(
                  MAX_PLANNER_MAX_OUTPUT_TOKENS,
                  Number(e.target.value) || DEFAULT_PLANNER_MAX_OUTPUT_TOKENS,
                ),
              ),
            })
          }
        />
        <p className="prov-hint">
          Gemini 2.5 Pro uses internal reasoning tokens against this budget. Use at
          least {DEFAULT_PLANNER_MAX_OUTPUT_TOKENS} for planning workloads.
        </p>
        <label className="prov-label" htmlFor="prov-max-repair">
          Max repair attempts
        </label>
        <input
          id="prov-max-repair"
          className="prov-input"
          type="number"
          min={0}
          max={10}
          value={settings.maxRepairAttempts ?? MAX_REPAIR_ATTEMPTS_DEFAULT}
          onChange={(e) =>
            update({
              maxRepairAttempts: Math.max(0, Number(e.target.value) || 0),
            })
          }
        />
        <label className="prov-label prov-label--check">
          <input
            type="checkbox"
            checked={settings.stopOnProviderLimit !== false}
            onChange={(e) => update({ stopOnProviderLimit: e.target.checked })}
          />
          Stop if provider returns rate-limit / insufficient credits
        </label>
        <label className="prov-label prov-label--check">
          <input
            type="checkbox"
            checked={settings.askBeforeFallback !== false}
            onChange={(e) => update({ askBeforeFallback: e.target.checked })}
          />
          Ask before fallback provider
        </label>
        <label className="prov-label" htmlFor="prov-backup">
          Backup provider (tried once if primary fails)
        </label>
        <select
          id="prov-backup"
          className="prov-input"
          value={settings.backupProvider ?? ""}
          onChange={(e) => {
            const value = e.target.value;
            update({
              backupProvider: value ? (value as ProviderId) : null,
            });
          }}
        >
          <option value="">Auto (fallback order)</option>
          {PROVIDERS.filter((p) => p.id !== provider).map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>
        <p className="prov-hint">{formatFallbackPolicy(settings)}</p>
      </section>

      <ProviderReliabilityDiagnostics settings={settings} />

      <section className="prov-block">
        <h3 className="prov-heading">Settings</h3>

        <label className="prov-label" htmlFor="prov-select">
          Provider
        </label>
        <select
          id="prov-select"
          className="prov-input"
          value={provider}
          onChange={(e) => {
            const next = e.target.value as ProviderId;
            update({ provider: next });
            setHealth(null);
            setDiscoveredModels([]);
            void persistProviderSwitch(next);
          }}
        >
          {PROVIDERS.map((p) => (
            <option key={p.id} value={p.id}>
              {p.label}
            </option>
          ))}
        </select>

        <div className="prov-model-head">
          <label className="prov-label" htmlFor="prov-model">
            Model
          </label>
          {usesDynamicModels && modelOptions.length > 0 ? (
            <span className="prov-model-count">
              {installedModelsLabel(modelOptions.length)}
            </span>
          ) : null}
        </div>
        {usesDynamicModels ? (
          <>
            <select
              id="prov-model"
              className="prov-input"
              value={activeModel}
              onChange={(e) => selectModel(e.target.value)}
              disabled={modelOptions.length === 0}
            >
              {modelOptions.length === 0 ? (
                <option value="">
                  {modelsRefreshing
                    ? "Loading models…"
                    : "Check health or refresh models"}
                </option>
              ) : (
                <>
                  {!activeModel ? (
                    <option value="">Select a model</option>
                  ) : null}
                  {modelOptions.map((m) => (
                    <option key={m} value={m}>
                      {provider === "ollama"
                        ? formatOllamaModelOptionLabel(m)
                        : m}
                    </option>
                  ))}
                </>
              )}
            </select>
            <button
              type="button"
              className="prov-btn"
              onClick={() => void refreshModels(settings)}
              disabled={modelsRefreshing || healthPhase === "loading"}
            >
              {modelsRefreshing ? "Refreshing…" : "Refresh models"}
            </button>
          </>
        ) : usesCuratedModels ? (
          <CuratedProviderModelSelect
            provider={provider}
            model={activeModel}
            onModelChange={selectModel}
            availableModelIds={geminiAvailableModelIds}
          />
        ) : (
          <>
            <input
              id="prov-model"
              className="prov-input"
              list="prov-model-options"
              value={activeModel}
              onChange={(e) => selectModel(e.target.value)}
            />
            <datalist id="prov-model-options">
              {modelOptions.map((m) => (
                <option key={m} value={m} />
              ))}
            </datalist>
          </>
        )}

        {info.needsApiKey ? (
          <ProviderApiKeyField
            provider={provider}
            settings={settings}
            draft={apiKeyInput}
            onDraftChange={setApiKeyInput}
            onClear={() => void clearApiKey()}
            saving={saving}
            checkHealth={(p) => api.checkProviderHealth(p)}
            revealApiKey={(p) => api.revealProviderApiKey(p)}
          />
        ) : null}

        {info.needsBaseUrl ? (
          <>
            <label className="prov-label" htmlFor="prov-base">
              Server URL
            </label>
            <input
              id="prov-base"
              className="prov-input"
              value={settings.ollamaBaseUrl}
              onChange={(e) => update({ ollamaBaseUrl: e.target.value })}
            />
            <ProviderConnectionTest
              provider={provider}
              settings={settings}
              checkHealth={(p) => api.checkProviderHealth(p)}
            />
          </>
        ) : null}

        <div className="prov-actions">
          <button
            type="button"
            className="prov-btn prov-btn--primary"
            onClick={() => void save()}
            disabled={saving}
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
          <button
            type="button"
            className="prov-btn"
            onClick={() => void testProviderConnection()}
            disabled={connectionTestPhase === "loading"}
          >
            {connectionTestPhase === "loading"
              ? "Testing…"
              : "Test provider connection"}
          </button>
          <button
            type="button"
            className="prov-btn"
            onClick={() => void runHealth(provider, settings)}
            disabled={healthPhase === "loading"}
          >
            {healthPhase === "loading" ? "Checking…" : "Check health"}
          </button>
        </div>
        {connectionTestNote ? (
          <p
            className={`prov-note${connectionTestPhase === "error" ? " prov-note--error" : ""}`}
          >
            {connectionTestNote}
          </p>
        ) : null}
        {savedNote ? <p className="prov-note">{savedNote}</p> : null}
      </section>

      {health || healthPhase === "error" ? (
        <section className="prov-block">
          <h3 className="prov-heading">
            Health
            {health ? (
              <span
                className={`prov-badge prov-badge--${health.ok ? "pass" : "fail"}`}
              >
                {health.ok ? "Healthy" : "Unhealthy"}
              </span>
            ) : null}
            {connectionStatus ? (
              <span className="prov-badge prov-badge--status">
                {PROVIDER_CONNECTION_LABELS[connectionStatus]}
              </span>
            ) : null}
          </h3>
          {healthPhase === "error" ? (
            <p className="prov-note prov-note--error">Health check failed to run.</p>
          ) : health ? (
            <>
              <ul className="prov-checks">
                {health.checks.map((c, i) => (
                  <li
                    key={i}
                    className={`prov-check prov-check--${c.ok ? "ok" : "bad"}`}
                  >
                    <span className="prov-check__dot" aria-hidden />
                    <span className="prov-check__label">{c.label}</span>
                    {c.detail ? (
                      <span className="prov-check__detail">{c.detail}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
              {health.models && health.models.length > 0 ? (
                <p className="prov-models">
                  {installedModelsLabel(health.models.length)}:{" "}
                  {health.models.join(", ")}
                </p>
              ) : null}
              {health.error ? (
                <p className="prov-note prov-note--error">{health.error}</p>
              ) : null}
            </>
          ) : null}
        </section>
      ) : null}

      <section className="prov-block">
        <h3 className="prov-heading">File write mode</h3>
        <p className="prov-hint">
          Controls whether greenfield and agent writes require an empty folder or
          may overwrite existing project files.
        </p>
        <label className="prov-label" htmlFor="prov-file-write-mode">
          Write mode
        </label>
        <select
          id="prov-file-write-mode"
          className="prov-input"
          value={settings.fileWriteMode ?? "workspace"}
          onChange={(e) =>
            update({ fileWriteMode: e.target.value as FileWriteMode })
          }
        >
          <option value="workspace">Workspace Mode (overwrite existing files)</option>
          <option value="safe">Safe Mode (empty folders only)</option>
        </select>
      </section>

      <section className="prov-block">
        <h3 className="prov-heading">Auto Fix (Apply Plan)</h3>
        <p className="prov-hint">
          After Apply Plan fails verification, optionally generate targeted repairs
          (max 3 attempts).
        </p>
        <label className="prov-label" htmlFor="prov-autofix">
          Auto Fix mode
        </label>
        <select
          id="prov-autofix"
          className="prov-input"
          value={settings.autoFixMode ?? "ask"}
          onChange={(e) =>
            update({ autoFixMode: e.target.value as AutoFixMode })
          }
        >
          <option value="off">Off</option>
          <option value="ask">Ask before repair</option>
          <option value="automatic">Automatic</option>
        </select>
      </section>

      <section className="prov-block">
        <h3 className="prov-heading">Test prompt</h3>
        <input
          className="prov-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Hello"
        />
        <div className="prov-actions">
          <button
            type="button"
            className="prov-btn prov-btn--primary"
            onClick={() => void runTest()}
            disabled={testPhase === "loading"}
          >
            {testPhase === "loading" ? "Sending…" : "Run test"}
          </button>
        </div>

        {testPhase === "error" ? (
          <p className="prov-note prov-note--error">Test failed to run.</p>
        ) : response ? (
          <div className="prov-response">
            <div className="prov-response__meta">
              <span
                className={`prov-badge prov-badge--${response.ok ? "pass" : "fail"}`}
              >
                {response.ok ? "OK" : "Failed"}
              </span>
              <span className="prov-response__sub">
                {getProviderInfo(response.provider).label} · {response.model} ·{" "}
                {response.latencyMs}ms
              </span>
            </div>
            {response.error ? (
              <p className="prov-note prov-note--error">{response.error}</p>
            ) : null}
            {response.text ? (
              <pre className="prov-response__text">{response.text}</pre>
            ) : null}
            <details className="prov-raw">
              <summary>Raw response</summary>
              <pre className="prov-raw__pre">
                {JSON.stringify(response.raw, null, 2)}
              </pre>
            </details>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="prov-strip__field">
      <span className="prov-strip__label">{label}</span>
      <span className="prov-strip__value">{value}</span>
    </div>
  );
}

function StageRouteField({
  label,
  provider,
  model,
  geminiAvailableModelIds,
  onProvider,
  onModel,
}: {
  label: string;
  provider: ProviderId;
  model: string;
  geminiAvailableModelIds?: readonly string[] | undefined;
  onProvider: (provider: ProviderId) => void;
  onModel: (model: string) => void;
}) {
  const stageInfo = getProviderInfo(provider);
  const usesDynamic = providerUsesDynamicModels(provider);
  const usesCurated = providerUsesCuratedModels(provider);
  const modelOptions = usesDynamic
    ? [model].filter(Boolean)
    : stageInfo.suggestedModels;

  return (
    <div className="prov-stage">
      <h4 className="prov-stage__title">{label}</h4>
      <label className="prov-label">Provider</label>
      <select
        className="prov-input"
        value={provider}
        onChange={(e) => onProvider(e.target.value as ProviderId)}
      >
        {PROVIDERS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <label className="prov-label">Model</label>
      {usesDynamic ? (
        <input
          className="prov-input"
          value={model}
          onChange={(e) => onModel(e.target.value)}
          placeholder="e.g. qwen2.5-coder:7b"
        />
      ) : usesCurated ? (
        <CuratedProviderModelSelect
          provider={provider}
          model={model}
          onModelChange={onModel}
          availableModelIds={
            provider === "gemini" ? geminiAvailableModelIds : undefined
          }
          id={`prov-stage-model-${label}`}
        />
      ) : (
        <>
          <input
            className="prov-input"
            list={`prov-stage-model-${label}`}
            value={model}
            onChange={(e) => onModel(e.target.value)}
          />
          <datalist id={`prov-stage-model-${label}`}>
            {modelOptions.map((m) => (
              <option key={m} value={m} />
            ))}
          </datalist>
        </>
      )}
    </div>
  );
}
