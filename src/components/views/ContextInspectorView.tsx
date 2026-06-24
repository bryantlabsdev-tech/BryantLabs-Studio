import { useCallback, useMemo, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { EmptyState } from "@/components/EmptyState";
import {
  formatMetricsLine,
  warningIcon,
} from "@/core/contextInspector/warnings";
import type { ContextSnapshot } from "@/core/contextInspector/types";

const OPERATION_LABELS: Record<ContextSnapshot["operation"], string> = {
  ai_plan: "AI Plan",
  apply_plan: "Apply Plan",
  ai_patch: "AI Patch",
  agent: "Agent",
  pipeline_planner: "Pipeline · Planner",
  pipeline_coder: "Pipeline · Coder",
  pipeline_repair: "Pipeline · Repair",
};

function formatContextOperation(operation: ContextSnapshot["operation"]): string {
  return OPERATION_LABELS[operation] ?? operation;
}

export function ContextInspectorView() {
  const {
    project,
    contextSnapshot,
    contextHistory,
    contextInspectorDraft,
    selectedContextId,
    selectContextSnapshot,
    refreshContextInspectorDraft,
    showContextRequestPreview,
    setShowContextRequestPreview,
  } = useWorkspace();

  const active = useMemo(() => {
    if (selectedContextId && contextHistory.length > 0) {
      const hit = contextHistory.find((e) => e.id === selectedContextId);
      if (hit) return hit;
    }
    return contextSnapshot ?? contextInspectorDraft;
  }, [
    selectedContextId,
    contextHistory,
    contextSnapshot,
    contextInspectorDraft,
  ]);

  const [copyMsg, setCopyMsg] = useState<string | null>(null);

  const flash = useCallback((msg: string) => {
    setCopyMsg(msg);
    window.setTimeout(() => setCopyMsg(null), 2000);
  }, []);

  const copyText = useCallback(async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flash(`${label} copied`);
    } catch {
      flash(`Could not copy ${label}`);
    }
  }, [flash]);

  if (!project) {
    return (
      <EmptyState
        title="No project open"
        description="Open a project to inspect AI context payloads."
      />
    );
  }

  return (
    <div className="context-inspector">
      <header className="context-inspector__head">
        <p className="plan__muted">
          Inspect the exact context sent to AI providers before Plan, Apply Plan,
          Patch, and Agent runs.
        </p>
        <div className="context-inspector__toolbar">
          <button
            type="button"
            className="prov-btn"
            onClick={() => refreshContextInspectorDraft()}
          >
            Refresh live preview
          </button>
          <button
            type="button"
            className={`prov-btn${showContextRequestPreview ? " prov-btn--active" : ""}`}
            onClick={() => setShowContextRequestPreview(!showContextRequestPreview)}
          >
            Preview AI Request
          </button>
        </div>
        {copyMsg ? (
          <p className="context-inspector__flash" role="status">
            {copyMsg}
          </p>
        ) : null}
      </header>

      {active ? (
        <ContextSnapshotPanel
          snapshot={active}
          isLive={!contextSnapshot || active.id !== contextSnapshot.id}
          showRequestPreview={showContextRequestPreview}
          onCopyText={copyText}
        />
      ) : (
        <p className="plan__muted">
          Run AI Plan, Apply Plan, AI Patch, or Agent to capture context — or
          refresh live preview from the current plan prompt.
        </p>
      )}

      <section className="context-inspector__history">
        <h3 className="context-inspector__heading">Context history</h3>
        {contextHistory.length === 0 ? (
          <p className="plan__muted">No captured contexts yet.</p>
        ) : (
          <ul className="context-inspector__history-list">
            {contextHistory.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  className={`context-inspector__history-btn${
                    selectedContextId === entry.id ||
                    (!selectedContextId && contextSnapshot?.id === entry.id)
                      ? " context-inspector__history-btn--on"
                      : ""
                  }`}
                  onClick={() => selectContextSnapshot(entry.id)}
                >
                  <span className="context-inspector__history-time">
                    {new Date(entry.at).toLocaleString()}
                  </span>
                  <span className="context-inspector__history-meta">
                    {formatContextOperation(entry.operation)} · {entry.provider} · {entry.model}
                  </span>
                  <span className="context-inspector__history-prompt">
                    {entry.prompt.original.slice(0, 80)}
                    {entry.prompt.original.length > 80 ? "…" : ""}
                  </span>
                  <span className="context-inspector__history-tokens">
                    {entry.metrics.estimatedTotalTokens.toLocaleString()} tokens
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function ContextSnapshotPanel({
  snapshot,
  isLive,
  showRequestPreview,
  onCopyText,
}: {
  snapshot: ContextSnapshot;
  isLive: boolean;
  showRequestPreview: boolean;
  onCopyText: (text: string, label: string) => void;
}) {
  const payloadJson = JSON.stringify(snapshot.finalPayload, null, 2);

  return (
    <>
      <div className="context-inspector__meta">
        {isLive ? (
          <span className="chip chip--on">Live preview</span>
        ) : (
          <span className="chip chip--on">Last captured</span>
        )}
        <span className="plan__muted">
          {formatContextOperation(snapshot.operation)} · {snapshot.provider} · {snapshot.model}
        </span>
        <span className="plan__muted">
          {new Date(snapshot.at).toLocaleString()}
        </span>
      </div>

      {snapshot.warnings.length > 0 ? (
        <ul className="context-inspector__warnings">
          {snapshot.warnings.map((w) => (
            <li
              key={w.message}
              className={`context-inspector__warning context-inspector__warning--${w.level}`}
            >
              {warningIcon(w.level)} {w.message}
            </li>
          ))}
        </ul>
      ) : null}

      <section className="context-inspector__section">
        <h4 className="context-inspector__heading">Provider orchestration</h4>
        <dl className="context-inspector__facts">
          <Fact
            k="Agent mode"
            v={
              snapshot.orchestration.agentMode === "pipeline"
                ? "Multi-Agent Pipeline"
                : "Single Agent"
            }
          />
          <Fact k="Stage" v={snapshot.orchestration.stage ?? "—"} />
          <Fact
            k="Estimated AI calls"
            v={
              snapshot.orchestration.estimatedAiCalls != null
                ? String(snapshot.orchestration.estimatedAiCalls)
                : "—"
            }
          />
          <Fact
            k="Max repair attempts"
            v={String(snapshot.orchestration.maxRepairAttempts)}
          />
        </dl>
        <p className="context-inspector__label">Provider routing</p>
        <pre className="context-inspector__pre">
          {snapshot.orchestration.routingSummary}
        </pre>
        <p className="context-inspector__label">Fallback policy</p>
        <pre className="context-inspector__pre">
          {snapshot.orchestration.fallbackPolicy}
        </pre>
        {snapshot.orchestration.providerHealthAtStart ? (
          <>
            <p className="context-inspector__label">Provider health at run start</p>
            <pre className="context-inspector__pre">
              {Object.entries(snapshot.orchestration.providerHealthAtStart)
                .map(([id, status]) => `${id}: ${status}`)
                .join("\n")}
            </pre>
          </>
        ) : null}
        {snapshot.orchestration.providerFailureSummary ? (
          <Fact
            k="Provider failure"
            v={snapshot.orchestration.providerFailureSummary}
          />
        ) : null}
      </section>

      <section className="context-inspector__section">
        <h4 className="context-inspector__heading">Context metrics</h4>
        <pre className="context-inspector__pre">
          {formatMetricsLine(snapshot.metrics)}
        </pre>
      </section>

      <section className="context-inspector__section">
        <h4 className="context-inspector__heading">Prompt context</h4>
        <p className="context-inspector__label">Original</p>
        <pre className="context-inspector__pre">{snapshot.prompt.original}</pre>
        <p className="context-inspector__label">Expanded (session / follow-up)</p>
        <pre className="context-inspector__pre">{snapshot.prompt.expanded}</pre>
      </section>

      <section className="context-inspector__section">
        <h4 className="context-inspector__heading">Repository context</h4>
        <dl className="context-inspector__facts">
          <Fact k="Framework" v={snapshot.repository.framework} />
          <Fact k="Language" v={snapshot.repository.language} />
          <Fact k="Bundler" v={snapshot.repository.bundler} />
          <Fact k="Package manager" v={snapshot.repository.packageManager} />
          <Fact k="Files" v={String(snapshot.repository.fileCount)} />
          <Fact k="Components" v={String(snapshot.repository.componentCount)} />
        </dl>
        <p className="context-inspector__label">Repository summary</p>
        <pre className="context-inspector__pre">{snapshot.repository.summary}</pre>
        {snapshot.repository.dependencies.length > 0 ? (
          <>
            <p className="context-inspector__label">Dependencies</p>
            <ul className="context-inspector__list">
              {snapshot.repository.dependencies.slice(0, 20).map((d) => (
                <li key={`${d.kind}-${d.name}`}>
                  <code>{d.name}</code> {d.version}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="context-inspector__section">
        <h4 className="context-inspector__heading">Memory context</h4>
        {!snapshot.memory.hasContent ? (
          <p className="plan__muted">No project memory found.</p>
        ) : (
          <>
            <dl className="context-inspector__facts">
              <Fact k="Project name" v={snapshot.memory.projectName || "—"} />
              <Fact k="Architecture" v={snapshot.memory.architecture || "—"} />
              <Fact k="Preferences" v={snapshot.memory.preferences || "—"} />
              <Fact k="Notes" v={snapshot.memory.notes || "—"} />
            </dl>
            {snapshot.memory.retrievedMemories.length > 0 ? (
              <>
                <p className="context-inspector__label">
                  Retrieved memories · {snapshot.memory.retrievalTokens} tokens · hits{" "}
                  {snapshot.memory.retrievalHitCount}
                </p>
                <ul className="context-inspector__list">
                  {snapshot.memory.retrievedMemories.map((m) => (
                    <li key={m.id} className="context-inspector__memory-row">
                      <strong>
                        [{m.category}] {m.title}
                      </strong>
                      <span className="plan__muted">
                        {" "}
                        · score {m.relevanceScore} · ~{m.estimatedTokens} tokens
                      </span>
                      <p className="plan__muted">Why: {m.selectionReason}</p>
                      <pre className="context-inspector__pre">{m.content}</pre>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </>
        )}
      </section>

      <section className="context-inspector__section">
        <h4 className="context-inspector__heading">Selected files</h4>
        {snapshot.fileSelection.selectedFiles.length === 0 ? (
          <p className="plan__muted">
            No smart file selection for this capture (run with a plan prompt).
          </p>
        ) : (
          <>
            {snapshot.fileSelection.intentSummary ? (
              <p className="plan__muted">{snapshot.fileSelection.intentSummary}</p>
            ) : null}
            {snapshot.fileSelection.reasoning ? (
              <p className="context-inspector__label">Reasoning</p>
            ) : null}
            {snapshot.fileSelection.reasoning ? (
              <pre className="context-inspector__pre">
                {snapshot.fileSelection.reasoning}
              </pre>
            ) : null}
            <ul className="context-inspector__list context-inspector__list--files">
              {snapshot.fileSelection.selectedFiles.map((f) => (
                <li key={f.path} className="context-inspector__file-row">
                  <code>{f.path}</code>
                  <span className="plan__muted"> Score: {f.score}</span>
                  <p className="plan__muted">Reason: {f.primaryReason}</p>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="context-inspector__section">
        <h4 className="context-inspector__heading">Symbol context</h4>
        {snapshot.symbols.intelligenceSummary ? (
          <pre className="context-inspector__pre">
            {snapshot.symbols.intelligenceSummary}
          </pre>
        ) : null}
        <SymbolList label="Relevant components" items={snapshot.symbols.relevantComponents} />
        <SymbolList label="Relevant functions" items={snapshot.symbols.relevantFunctions} />
        <SymbolList label="Relevant hooks" items={snapshot.symbols.relevantHooks} />
        <SymbolList label="Relevant types" items={snapshot.symbols.relevantTypes} />
        {snapshot.symbols.relevantFiles.length > 0 ? (
          <>
            <p className="context-inspector__label">Relevant files</p>
            <ul className="context-inspector__list">
              {snapshot.symbols.relevantFiles.map((f) => (
                <li key={f.path}>
                  <code>{f.path}</code>
                  <span className="plan__muted"> ({f.score})</span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        {snapshot.symbols.relevantSymbols.length > 0 ? (
          <>
            <p className="context-inspector__label">Relevant symbols</p>
            <ul className="context-inspector__list">
              {snapshot.symbols.relevantSymbols.map((s) => (
                <li key={`${s.path}-${s.name}`}>
                  <strong>{s.name}</strong> ({s.kind}) — <code>{s.path}</code>
                  {s.line != null ? ` :${s.line}` : ""}
                </li>
              ))}
            </ul>
          </>
        ) : null}
      </section>

      <section className="context-inspector__section">
        <h4 className="context-inspector__heading">Final context payload</h4>
        <pre className="context-inspector__pre context-inspector__pre--payload">
          {payloadJson}
        </pre>
      </section>

      {showRequestPreview ? (
        <section className="context-inspector__section">
          <h4 className="context-inspector__heading">AI request preview</h4>
          <p className="plan__muted">
            Provider: {snapshot.provider} · API keys redacted
          </p>
          <pre className="context-inspector__pre context-inspector__pre--preview">
            {snapshot.requestPreview}
          </pre>
        </section>
      ) : null}

      <div className="context-inspector__actions">
        <button
          type="button"
          className="prov-btn"
          onClick={() => onCopyText(payloadJson, "Context JSON")}
        >
          Export Context JSON
        </button>
        <button
          type="button"
          className="prov-btn"
          onClick={() => onCopyText(snapshot.requestPreview, "Final prompt")}
        >
          Copy Final Prompt
        </button>
        <button
          type="button"
          className="prov-btn"
          onClick={() =>
            onCopyText(
              [
                formatMetricsLine(snapshot.metrics),
                "",
                snapshot.prompt.original,
                "",
                payloadJson,
              ].join("\n"),
              "Context",
            )
          }
        >
          Copy Context
        </button>
      </div>
    </>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div>
      <dt>{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}

function SymbolList({ label, items }: { label: string; items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <>
      <p className="context-inspector__label">{label}</p>
      <ul className="context-inspector__list">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </>
  );
}
