import { useCallback, useMemo, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { emptyAgentWorkspaceSession } from "@/core/agentWorkspace";
import {
  buildAgentExportContext,
  formatAgentCopySection,
  formatAgentFullReportJson,
  formatAgentFullReportMarkdown,
  type AgentCopySection,
  type AgentExportContext,
} from "@/core/agentWorkspace/export";
function useAgentExportContext(): AgentExportContext {
  const {
    project,
    agentSession,
    agentLoopSession,
    agentLoopError,
    greenfieldRun,
    lastPlanPrompt,
    plan,
    verification,
  } = useWorkspace();

  return useMemo(
    () =>
      buildAgentExportContext({
        projectPath: project?.path ?? null,
        agentSession: agentSession ?? emptyAgentWorkspaceSession(),
        agentLoopSession,
        agentLoopError,
        provider: greenfieldRun.provider ?? null,
        model: greenfieldRun.model ?? null,
        lastPlanPrompt,
        planSummary: plan?.summary ?? null,
        verification,
        failureReport: greenfieldRun.failureReport ?? null,
      }),
    [
      project?.path,
      agentSession,
      agentLoopSession,
      agentLoopError,
      greenfieldRun.provider,
      greenfieldRun.model,
      greenfieldRun.failureReport,
      lastPlanPrompt,
      plan?.summary,
      verification,
    ],
  );
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function downloadText(filename: string, text: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

interface AgentCopyBarProps {
  /** When false, copy actions are disabled (no active session). */
  readonly enabled: boolean;
}

export function AgentCopyBar({ enabled }: AgentCopyBarProps) {
  const ctx = useAgentExportContext();
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const notify = useCallback((label: string, ok: boolean) => {
    setCopyNote(ok ? `${label} copied` : "Copy failed");
    window.setTimeout(() => setCopyNote(null), 2200);
  }, []);

  const onCopy = useCallback(
    async (section: AgentCopySection, label: string) => {
      const text = formatAgentCopySection(ctx, section, "markdown");
      notify(label, await copyText(text));
    },
    [ctx, notify],
  );

  const onCopyFullJson = useCallback(async () => {
    const text = formatAgentCopySection(ctx, "full_report", "json");
    notify("Full report (JSON)", await copyText(text));
  }, [ctx, notify]);

  const onExport = useCallback(
    (format: "markdown" | "json") => {
      const text =
        format === "json"
          ? formatAgentFullReportJson(ctx)
          : formatAgentFullReportMarkdown(ctx);
      const ext = format === "json" ? "json" : "md";
      downloadText(
        `bryantlabs-agent-report-${Date.now()}.${ext}`,
        text,
        format === "json" ? "application/json" : "text/markdown",
      );
      setCopyNote(`Exported ${format.toUpperCase()}`);
      window.setTimeout(() => setCopyNote(null), 2200);
    },
    [ctx],
  );

  return (
    <section className="agent__copy-bar" aria-label="Copy and export agent diagnostics">
      <div className="agent__copy-head">
        <h4 className="agent__heading">Copy for debugging</h4>
        {copyNote ? (
          <span className="agent__copy-note" role="status">
            {copyNote}
          </span>
        ) : null}
      </div>
      <div className="agent__copy-actions">
        <button
          type="button"
          className="prov-btn"
          disabled={!enabled}
          onClick={() => void onCopy("live_run", "Live run")}
        >
          Copy live run
        </button>
        <button
          type="button"
          className="prov-btn"
          disabled={!enabled}
          onClick={() => void onCopy("reasoning", "Reasoning")}
        >
          Copy reasoning
        </button>
        <button
          type="button"
          className="prov-btn"
          disabled={!enabled}
          onClick={() => void onCopy("errors", "Errors")}
        >
          Copy errors
        </button>
        <button
          type="button"
          className="prov-btn"
          disabled={!enabled}
          onClick={() => void onCopy("timeline", "Timeline")}
        >
          Copy timeline
        </button>
        <button
          type="button"
          className="prov-btn prov-btn--primary"
          disabled={!enabled}
          onClick={() => void onCopy("full_report", "Full report")}
        >
          Copy full report
        </button>
        <button
          type="button"
          className="prov-btn"
          disabled={!enabled}
          onClick={() => void onCopyFullJson()}
        >
          Copy JSON
        </button>
      </div>
      <div className="agent__copy-actions agent__copy-actions--export">
        <span className="agent__copy-export-label">Export</span>
        <button
          type="button"
          className="prov-btn"
          disabled={!enabled}
          onClick={() => onExport("markdown")}
        >
          Markdown
        </button>
        <button
          type="button"
          className="prov-btn"
          disabled={!enabled}
          onClick={() => onExport("json")}
        >
          JSON
        </button>
      </div>
      <p className="plan__muted agent__copy-hint">
        Secrets and API keys are redacted. Paste into ChatGPT or another assistant for diagnosis.
      </p>
    </section>
  );
}
