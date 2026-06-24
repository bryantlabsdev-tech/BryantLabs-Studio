import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  apiKeyPreviewForProvider,
  STORED_KEY_PLACEHOLDER,
  shouldPersistApiKeyDraft,
} from "@/core/providers/apiKeyStorage";
import {
  apiKeySavedIndicator,
  providerConnectionTestLabel,
  providerConnectionTestTone,
  type ProviderKeyTestPhase,
} from "@/core/providers/apiKeyUi";
import {
  hasStoredApiKey,
  providerLabel,
} from "@/core/providers/AnthropicProvider";
import type { HealthResult, ProviderId, ProviderSettings } from "@/core/providers/types";

type Phase = ProviderKeyTestPhase;

interface ProviderApiKeyFieldProps {
  provider: ProviderId;
  settings: ProviderSettings;
  draft: string;
  onDraftChange: (value: string) => void;
  onClear: () => void;
  saving: boolean;
  checkHealth: (provider: ProviderId) => Promise<HealthResult>;
  revealApiKey: (provider: ProviderId) => Promise<{ ok: boolean; key?: string; error?: string }>;
}

export function ProviderApiKeyField({
  provider,
  settings,
  draft,
  onDraftChange,
  onClear,
  saving,
  checkHealth,
  revealApiKey,
}: ProviderApiKeyFieldProps) {
  const [visible, setVisible] = useState(false);
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [copyNote, setCopyNote] = useState<string | null>(null);
  const [testHealth, setTestHealth] = useState<HealthResult | null>(null);
  const [testPhase, setTestPhase] = useState<Phase>("idle");

  const hasKey = hasStoredApiKey(settings, provider);
  const maskedPreview = apiKeyPreviewForProvider(settings, provider);
  const keyStatus = apiKeySavedIndicator(settings, provider);
  const testLabel = providerConnectionTestLabel(provider, settings, testHealth, testPhase);
  const testTone = providerConnectionTestTone(testHealth, testPhase);

  useEffect(() => {
    setVisible(false);
    setRevealedKey(null);
    setEditing(false);
    setCopyNote(null);
    setTestHealth(null);
    setTestPhase("idle");
  }, [provider]);

  const resolveCopyKey = useCallback(async (): Promise<string | null> => {
    if (shouldPersistApiKeyDraft(draft, maskedPreview)) return draft.trim();
    if (revealedKey) return revealedKey;
    if (!hasKey) return null;
    const res = await revealApiKey(provider);
    return res.ok && res.key ? res.key : null;
  }, [draft, maskedPreview, revealedKey, hasKey, revealApiKey, provider]);

  const toggleVisible = async () => {
    if (visible) {
      setVisible(false);
      setRevealedKey(null);
      return;
    }
    if (shouldPersistApiKeyDraft(draft, maskedPreview)) {
      setVisible(true);
      return;
    }
    if (!hasKey) {
      setVisible(true);
      return;
    }
    const res = await revealApiKey(provider);
    if (res.ok && res.key) {
      setRevealedKey(res.key);
      setVisible(true);
    }
  };

  const copyKey = async () => {
    const key = await resolveCopyKey();
    if (!key) return;
    try {
      await navigator.clipboard.writeText(key);
      setCopyNote("Copied");
      window.setTimeout(() => setCopyNote(null), 2000);
    } catch {
      setCopyNote("Copy failed");
      window.setTimeout(() => setCopyNote(null), 2000);
    }
  };

  const runTest = async () => {
    setTestPhase("loading");
    setTestHealth(null);
    try {
      const res = await checkHealth(provider);
      setTestHealth(res);
      setTestPhase("done");
    } catch {
      setTestPhase("error");
    }
  };

  const placeholder = hasKey
    ? STORED_KEY_PLACEHOLDER
    : `Paste ${providerLabel(provider)} API key`;

  const showingMaskedPreview =
    !visible &&
    hasKey &&
    !editing &&
    !shouldPersistApiKeyDraft(draft, maskedPreview);

  const inputType = visible || showingMaskedPreview ? "text" : "password";

  const displayValue = (() => {
    if (editing || shouldPersistApiKeyDraft(draft, maskedPreview)) return draft;
    if (visible && revealedKey) return revealedKey;
    if (hasKey && !visible) return maskedPreview ?? "";
    return draft;
  })();

  const handleFocus = () => {
    setEditing(true);
    if (hasKey && !shouldPersistApiKeyDraft(draft, maskedPreview)) {
      onDraftChange("");
    }
  };

  const handleBlur = () => {
    if (!draft.trim()) setEditing(false);
  };

  const handleChange = (e: FormEvent<HTMLInputElement>) => {
    onDraftChange(e.currentTarget.value);
    setEditing(true);
  };

  return (
    <div className="prov-key-field">
      <div className="prov-key-field__head">
        <label className="prov-label" htmlFor="prov-key">
          {providerLabel(provider)} API key
        </label>
        <span
          className={`prov-key-field__status prov-key-field__status--${
            keyStatus.saved ? "saved" : "missing"
          }`}
        >
          {keyStatus.label}
        </span>
      </div>

      <div className="prov-key-field__row">
        <input
          id="prov-key"
          className="prov-input prov-key-field__input"
          type={inputType}
          autoComplete="off"
          spellCheck={false}
          placeholder={placeholder}
          value={displayValue}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onChange={handleChange}
        />
        <div className="prov-key-field__actions">
          <button
            type="button"
            className="prov-btn prov-btn--small"
            onClick={() => void toggleVisible()}
          >
            {visible ? "Hide" : "Show"}
          </button>
          <button
            type="button"
            className="prov-btn prov-btn--small"
            onClick={() => void copyKey()}
          >
            Copy
          </button>
          <button
            type="button"
            className="prov-btn prov-btn--small"
            onClick={() => void runTest()}
            disabled={testPhase === "loading"}
          >
            {testPhase === "loading" ? "Testing…" : "Test"}
          </button>
        </div>
      </div>

      <div className="prov-key-field__meta">
        {copyNote ? <span className="prov-key-field__copy-note">{copyNote}</span> : null}
        {testLabel ? (
          <span className={`prov-key-field__test prov-key-field__test--${testTone}`}>
            {testLabel}
          </span>
        ) : null}
      </div>

      {hasKey ? (
        <button
          type="button"
          className="prov-btn prov-btn--danger prov-btn--small"
          onClick={onClear}
          disabled={saving}
        >
          Clear saved key
        </button>
      ) : null}
    </div>
  );
}

interface ProviderConnectionTestProps {
  provider: ProviderId;
  settings: ProviderSettings;
  checkHealth: (provider: ProviderId) => Promise<HealthResult>;
  label?: string;
}

export function ProviderConnectionTest({
  provider,
  settings,
  checkHealth,
  label = "Test connection",
}: ProviderConnectionTestProps) {
  const [testHealth, setTestHealth] = useState<HealthResult | null>(null);
  const [testPhase, setTestPhase] = useState<Phase>("idle");

  useEffect(() => {
    setTestHealth(null);
    setTestPhase("idle");
  }, [provider]);

  const testLabel = providerConnectionTestLabel(provider, settings, testHealth, testPhase);
  const testTone = providerConnectionTestTone(testHealth, testPhase);

  const runTest = async () => {
    setTestPhase("loading");
    setTestHealth(null);
    try {
      const res = await checkHealth(provider);
      setTestHealth(res);
      setTestPhase("done");
    } catch {
      setTestPhase("error");
    }
  };

  return (
    <div className="prov-key-field__test-row">
      <button
        type="button"
        className="prov-btn prov-btn--small"
        onClick={() => void runTest()}
        disabled={testPhase === "loading"}
      >
        {testPhase === "loading" ? "Testing…" : "Test"}
      </button>
      {testLabel ? (
        <span className={`prov-key-field__test prov-key-field__test--${testTone}`}>
          {testLabel}
        </span>
      ) : (
        <span className="prov-key-field__test-hint">{label}</span>
      )}
    </div>
  );
}
