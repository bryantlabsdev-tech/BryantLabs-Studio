import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ComposerModeOverride } from "@/core/agent/unifiedAgentRoute";
import {
  buildMentionSuggestions,
  detectActiveMention,
  insertMentionAt,
  type MentionSuggestion,
} from "@/core/agent/composerMentionSuggestions";
import { MentionAutocomplete } from "@/components/agent/MentionAutocomplete";
import { CuratedProviderModelSelect } from "@/components/views/CuratedProviderModelSelect";
import { modelForProvider, patchModelForProvider } from "@/core/providers/AnthropicProvider";
import { PROVIDERS } from "@/core/providers/registry";
import type { ProviderId, ProviderSettings } from "@/core/providers/types";
import { MAX_AGENT_PROMPT_CHARS } from "@/core/agent/promptSubmission";
import { AgentFollowUpComposerState } from "@/components/agent/AgentFollowUpComposerState";
import type { ProjectScan } from "@/types";

export type ComposerAgentMode = "create" | "edit" | "fix" | "refactor" | "ask";

const AGENT_MODE_OPTIONS: readonly {
  value: ComposerAgentMode;
  label: string;
  override: ComposerModeOverride;
}[] = [
  { value: "create", label: "Create", override: "new_app" },
  { value: "edit", label: "Edit", override: "edit" },
  { value: "fix", label: "Fix", override: "fix_errors" },
  { value: "refactor", label: "Refactor", override: "edit" },
  { value: "ask", label: "Ask", override: "auto" },
];

export function composerModeFromOverride(
  override: ComposerModeOverride,
): ComposerAgentMode {
  if (override === "new_app") return "create";
  if (override === "fix_errors") return "fix";
  if (override === "edit") return "edit";
  return "ask";
}

export function overrideFromComposerMode(
  mode: ComposerAgentMode,
): ComposerModeOverride {
  return AGENT_MODE_OPTIONS.find((opt) => opt.value === mode)?.override ?? "auto";
}

export interface AgentComposerProps {
  readonly prompt: string;
  readonly onPromptChange: (value: string) => void;
  readonly onSubmit: () => void;
  readonly sendDisabled: boolean;
  readonly composerDisabled: boolean;
  readonly sendLabel: string;
  readonly placeholder: string;
  readonly active: boolean;
  readonly awaitingReview: boolean;
  readonly greenfieldActive: boolean;
  readonly reviewFirst: boolean;
  readonly onReviewFirstChange: (value: boolean) => void;
  readonly hasProject: boolean;
  readonly showExamples: boolean;
  readonly examplePrompts: readonly string[];
  readonly onExampleClick: (example: string) => void;
  readonly modeOverride: ComposerModeOverride;
  readonly onModeOverrideChange: (mode: ComposerModeOverride) => void;
  readonly providerSettings: ProviderSettings | null;
  readonly providerReady: boolean;
  readonly onProviderSettingsChange: (settings: ProviderSettings) => void;
  readonly onOpenSettings?: () => void;
  readonly onCancel?: () => void;
  readonly promptValidationWarning?: string | null;
  readonly showProjectEmptyState?: boolean;
  readonly onStartNewProject?: () => void;
  readonly onOpenExistingFolder?: () => void;
  readonly projectPickerBusy?: boolean;
  readonly followUpHeadline?: string | null;
  readonly followUpSuggestions?: readonly string[];
  readonly onFollowUpSuggestionClick?: (text: string) => void;
  readonly compactControls?: boolean;
  readonly projectScan?: ProjectScan | null;
}

export function AgentComposer({
  prompt,
  onPromptChange,
  onSubmit,
  sendDisabled,
  composerDisabled,
  sendLabel,
  placeholder,
  active,
  awaitingReview,
  greenfieldActive,
  reviewFirst,
  onReviewFirstChange,
  hasProject,
  showExamples,
  examplePrompts,
  onExampleClick,
  modeOverride,
  onModeOverrideChange,
  providerSettings,
  providerReady,
  onProviderSettingsChange,
  onOpenSettings,
  onCancel,
  promptValidationWarning = null,
  showProjectEmptyState = false,
  onStartNewProject,
  onOpenExistingFolder,
  projectPickerBusy = false,
  followUpHeadline = null,
  followUpSuggestions = [],
  onFollowUpSuggestionClick,
  compactControls = false,
  projectScan = null,
}: AgentComposerProps) {
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const [controlsOpen, setControlsOpen] = useState(false);
  const [mentionStart, setMentionStart] = useState<number | null>(null);
  const [mentionQuery, setMentionQuery] = useState("");
  const [mentionIndex, setMentionIndex] = useState(0);
  const [cursorPos, setCursorPos] = useState(0);
  const api = window.bryantlabs;
  const uiMode = composerModeFromOverride(modeOverride);

  const mentionSuggestions = useMemo(() => {
    if (mentionStart === null || !projectScan) return [];
    return buildMentionSuggestions(projectScan, mentionQuery);
  }, [mentionQuery, mentionStart, projectScan]);

  const mentionMenuOpen = mentionStart !== null && mentionSuggestions.length > 0;

  const syncMentionState = useCallback((text: string, cursor: number) => {
    setCursorPos(cursor);
    const active = detectActiveMention(text, cursor);
    if (!active || !projectScan) {
      setMentionStart(null);
      setMentionQuery("");
      setMentionIndex(0);
      return;
    }
    setMentionStart(active.start);
    setMentionQuery(active.query);
    setMentionIndex(0);
  }, [projectScan]);

  const applyMention = useCallback(
    (suggestion: MentionSuggestion) => {
      if (mentionStart === null) return;
      const { nextText, nextCursor } = insertMentionAt(
        prompt,
        cursorPos,
        mentionStart,
        suggestion.insertText,
      );
      onPromptChange(nextText);
      setMentionStart(null);
      setMentionQuery("");
      setMentionIndex(0);
      window.requestAnimationFrame(() => {
        const el = composerRef.current;
        if (!el) return;
        el.focus();
        el.setSelectionRange(nextCursor, nextCursor);
        setCursorPos(nextCursor);
      });
    },
    [cursorPos, mentionStart, onPromptChange, prompt],
  );

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 88), 220)}px`;
  }, [prompt]);

  const persistProviderPatch = useCallback(
    async (patch: Partial<ProviderSettings>) => {
      if (!api || !providerSettings) return;
      const next = await api.saveProviderSettings(patch);
      onProviderSettingsChange(next);
    },
    [api, onProviderSettingsChange, providerSettings],
  );

  const handleProviderChange = (provider: ProviderId) => {
    void persistProviderPatch({ provider });
  };

  const handleModelChange = (model: string) => {
    if (!providerSettings) return;
    void persistProviderPatch(patchModelForProvider(providerSettings.provider, model));
  };

  if (showProjectEmptyState && !hasProject) {
    return (
      <div className="agent-workspace-composer" data-testid="agent-composer-empty">
        <div className="agent-workspace-composer__empty">
          <h3 className="agent-workspace-composer__empty-title">Choose a project to get started</h3>
          <p className="agent-workspace-composer__empty-detail">
            Start a new app from scratch or open an existing folder. You can describe what you want
            to build once a project is selected.
          </p>
          <div className="agent-workspace-composer__empty-actions">
            {onStartNewProject ? (
              <button
                type="button"
                className="prov-btn prov-btn--primary"
                disabled={projectPickerBusy}
                onClick={onStartNewProject}
              >
                Start a new project
              </button>
            ) : null}
            {onOpenExistingFolder ? (
              <button
                type="button"
                className="prov-btn"
                disabled={projectPickerBusy}
                onClick={onOpenExistingFolder}
              >
                Open existing folder
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="agent-workspace-composer" data-testid="agent-composer">
      <AgentFollowUpComposerState
        headline={followUpHeadline}
        suggestions={followUpSuggestions}
        {...(onFollowUpSuggestionClick ? { onSuggestionClick: onFollowUpSuggestionClick } : {})}
      />
      {!providerReady && providerSettings !== null ? (
        <div className="build-view__provider-banner" role="alert">
          <p>
            Connect an AI provider to send prompts. Add your API key in Settings — Ollama works
            locally without a cloud key.
          </p>
          {onOpenSettings ? (
            <button type="button" className="prov-btn prov-btn--primary" onClick={onOpenSettings}>
              Open Settings
            </button>
          ) : null}
        </div>
      ) : null}

      <div
        className={[
          "agent-workspace-composer__prompt-wrap",
          composerDisabled ? "agent-workspace-composer__prompt-wrap--disabled" : "",
          active || greenfieldActive ? "agent-workspace-composer__prompt-wrap--busy" : "",
        ]
          .filter(Boolean)
          .join(" ")}
      >
        <label className="visually-hidden" htmlFor="build-prompt">
          Agent prompt
        </label>
        <textarea
          ref={composerRef}
          id="build-prompt"
          className="agent-workspace-composer__input"
          rows={3}
          spellCheck={false}
          maxLength={MAX_AGENT_PROMPT_CHARS}
          placeholder={placeholder}
          value={prompt}
          disabled={composerDisabled}
          onChange={(e) => {
            const next = e.target.value;
            const cursor = e.target.selectionStart ?? next.length;
            onPromptChange(next);
            syncMentionState(next, cursor);
          }}
          onClick={(e) => {
            const el = e.currentTarget;
            syncMentionState(el.value, el.selectionStart ?? el.value.length);
          }}
          onKeyUp={(e) => {
            const el = e.currentTarget;
            syncMentionState(el.value, el.selectionStart ?? el.value.length);
          }}
          onKeyDown={(e) => {
            if (mentionMenuOpen) {
              if (e.key === "ArrowDown") {
                e.preventDefault();
                setMentionIndex((idx) =>
                  Math.min(idx + 1, mentionSuggestions.length - 1),
                );
                return;
              }
              if (e.key === "ArrowUp") {
                e.preventDefault();
                setMentionIndex((idx) => Math.max(idx - 1, 0));
                return;
              }
              if (e.key === "Tab" || (e.key === "Enter" && mentionQuery.length > 0)) {
                e.preventDefault();
                const picked = mentionSuggestions[mentionIndex];
                if (picked) applyMention(picked);
                return;
              }
              if (e.key === "Escape") {
                e.preventDefault();
                setMentionStart(null);
                setMentionQuery("");
                return;
              }
            }
            if (e.key === "Enter" && !e.shiftKey && !sendDisabled) {
              e.preventDefault();
              onSubmit();
              return;
            }
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && !sendDisabled) {
              onSubmit();
            }
          }}
        />

        {mentionMenuOpen ? (
          <MentionAutocomplete
            suggestions={mentionSuggestions}
            activeIndex={mentionIndex}
            onSelect={applyMention}
          />
        ) : null}

        <div className="agent-workspace-composer__controls">
          {!compactControls || controlsOpen ? (
            <>
              {providerSettings ? (
                <>
                  <div className="agent-workspace-composer__control-group">
                    <span className="agent-workspace-composer__control-label">Provider</span>
                    <select
                      className="agent-workspace-composer__select"
                      aria-label="AI provider"
                      value={providerSettings.provider}
                      disabled={composerDisabled}
                      onChange={(e) => handleProviderChange(e.target.value as ProviderId)}
                    >
                      {PROVIDERS.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="agent-workspace-composer__control-group">
                    <span className="agent-workspace-composer__control-label">Model</span>
                    <CuratedProviderModelSelect
                      provider={providerSettings.provider}
                      model={modelForProvider(providerSettings, providerSettings.provider)}
                      onModelChange={handleModelChange}
                      inputClassName="agent-workspace-composer__select"
                      id="agent-composer-model"
                    />
                  </div>
                </>
              ) : null}

              <div className="agent-workspace-composer__control-group">
                <span className="agent-workspace-composer__control-label">Mode</span>
                <div className="agent-workspace-composer__mode-tabs" role="group" aria-label="Agent mode">
                  {AGENT_MODE_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={[
                        "agent-workspace-composer__mode-tab",
                        uiMode === opt.value ? "agent-workspace-composer__mode-tab--active" : "",
                      ]
                        .filter(Boolean)
                        .join(" ")}
                      disabled={composerDisabled}
                      aria-pressed={uiMode === opt.value}
                      onClick={() => onModeOverrideChange(opt.override)}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : compactControls && onOpenSettings ? (
            <button
              type="button"
              className="build-view__link agent-workspace-composer__settings-link"
              onClick={onOpenSettings}
            >
              Model & settings
            </button>
          ) : null}

          {hasProject ? (
            <button
              type="button"
              className={[
                "agent-workspace-composer__toggle",
                reviewFirst ? "agent-workspace-composer__toggle--active" : "",
              ]
                .filter(Boolean)
                .join(" ")}
              disabled={active}
              title="Pause to review diffs before applying (recommended)"
              aria-pressed={reviewFirst}
              onClick={() => onReviewFirstChange(!reviewFirst)}
            >
              Review first
            </button>
          ) : null}

          <div className="agent-workspace-composer__actions">
            {compactControls ? (
              <button
                type="button"
                className="build-view__link agent-workspace-composer__expand-controls"
                aria-expanded={controlsOpen}
                onClick={() => setControlsOpen((open) => !open)}
              >
                {controlsOpen ? "Less" : "Options"}
              </button>
            ) : null}
            {!compactControls ? (
              <span className="agent-workspace-composer__hint">
                {prompt.trim().length.toLocaleString()}/{MAX_AGENT_PROMPT_CHARS.toLocaleString()}
              </span>
            ) : null}
            {active || awaitingReview || greenfieldActive ? (
              onCancel ? (
                <button type="button" className="agent-composer__secondary" onClick={onCancel}>
                  {greenfieldActive ? "Cancel run" : "Cancel"}
                </button>
              ) : null
            ) : null}
            <button
              type="button"
              className="prov-btn prov-btn--primary agent-workspace-composer__run-btn"
              data-testid="agent-send"
              disabled={sendDisabled}
              onClick={onSubmit}
              aria-label={sendLabel}
            >
              {active || greenfieldActive ? sendLabel : "Run"}
            </button>
          </div>
        </div>
      </div>

      {promptValidationWarning ? (
        <p className="build-view__prompt-warning plan__muted" role="status">
          {promptValidationWarning}
        </p>
      ) : null}

      {showExamples ? (
        <div className="build-view__examples">
          {examplePrompts.map((ex) => (
            <button
              key={ex}
              type="button"
              className="build-view__example"
              disabled={composerDisabled}
              onClick={() => onExampleClick(ex)}
            >
              {ex}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
