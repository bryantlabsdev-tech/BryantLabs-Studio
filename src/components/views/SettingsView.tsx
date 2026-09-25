import { ProvidersView } from "@/components/views/ProvidersView";
import { AgentExecutionPolicyPanel } from "@/components/views/AgentExecutionPolicyPanel";
import {
  ProjectCodeApprovalDialog,
  type ProjectCodeApprovalPreview,
} from "@/components/views/ProjectCodeApprovalDialog";
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
  const [scriptPath, setScriptPath] = useState("scripts/hello.js");
  const [preview, setPreview] = useState<ProjectCodeApprovalPreview | null>(null);
  const [busy, setBusy] = useState(false);
  const [runNote, setRunNote] = useState("");

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
      <form
        className="project-code-request"
        data-testid="project-code-request"
        onSubmit={(event) => {
          event.preventDefault();
          if (!api?.prepareProjectCodeExecution || busy) return;
          setBusy(true);
          setRunNote("");
          void api
            .prepareProjectCodeExecution({ script: scriptPath })
            .then((result) => {
              if (result && "previewId" in result && result.ok) {
                setPreview(result);
              } else {
                setPreview(null);
                setRunNote(result && "error" in result ? (result.error ?? "Request denied.") : "Request denied.");
              }
            })
            .finally(() => setBusy(false));
        }}
      >
        <label htmlFor="project-code-script">Project script</label>
        <input
          id="project-code-script"
          data-testid="project-code-script"
          value={scriptPath}
          onChange={(event) => setScriptPath(event.target.value)}
        />
        <button type="submit" data-testid="project-code-review" disabled={busy}>
          Review project script
        </button>
        {runNote ? <p data-testid="project-code-note">{runNote}</p> : null}
      </form>
      {preview ? (
        <ProjectCodeApprovalDialog
          preview={preview}
          busy={busy}
          onCancel={() => {
            const current = preview;
            setPreview(null);
            void api?.cancelProjectCodeExecution?.({ previewId: current.previewId });
          }}
          onApprove={() => {
            if (!api?.confirmProjectCodeExecution) return;
            setBusy(true);
            void (async () => {
              const ran = await api.confirmProjectCodeExecution(preview.previewId);
              setRunNote(ran.ok ? "Project script finished." : (ran.error ?? "Project script failed."));
              setPreview(null);
              setBusy(false);
              const nextDenials = (await api.getAgentExecutionDenials?.()) ?? [];
              setDenials(nextDenials);
            })();
          }}
        />
      ) : null}
    </div>
  );
}
