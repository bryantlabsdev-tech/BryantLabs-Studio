import { useCallback, useEffect, useRef, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { useAgentRunViewModel } from "@/app/workspace/useAgentRunViewModel";
import { useExecutionDashboardTab } from "@/app/workspace/useExecutionDashboardTab";
import type { CenterTab } from "@/core/layout/types";
import { EditorPanel } from "@/components/EditorPanel";
import { DiffView } from "@/components/editor/DiffView";
import { DiffRowsView } from "@/components/editor/DiffRowsView";
import { PatchReviewPanel } from "@/components/editor/PatchReviewPanel";
import { AIPatchReviewActions } from "@/components/editor/AIPatchReviewActions";
import { EmptyState } from "@/components/EmptyState";
import { ViewSuspense } from "@/components/ViewSuspense";
import { AgentRunMetricsView } from "@/components/views/AgentRunMetricsView";
import { ProjectIntelligenceMemoryView } from "@/components/views/ProjectIntelligenceMemoryView";
import {
  LazyExecutionDashboard,
  LazyGeneratedFilesView,
  LazyGreenfieldLogsView,
  LazyGreenfieldInspectorView,
  LazyGreenfieldSummaryView,
  LazyPreviewView,
} from "@/components/lazyViews";
import { ArtifactDiffView } from "@/components/views/ArtifactDiffView";
import { LiveRunDiffView } from "@/components/views/LiveRunDiffView";
import { useSelectedAgentArtifact } from "@/app/workspace/useSelectedAgentArtifact";
import { useLiveRunDiffs } from "@/app/workspace/useLiveRunDiffs";
import { artifactHasDiffContent } from "@/core/agent/artifactDiffView";

const PRIMARY_TABS: ReadonlyArray<{ id: CenterTab; label: string }> = [
  { id: "editor", label: "Editor" },
  { id: "execution", label: "Execution" },
  { id: "preview", label: "Preview" },
  { id: "diff", label: "Diff" },
  { id: "studioLog", label: "Studio Log" },
];

const OVERFLOW_TABS: ReadonlyArray<{ id: CenterTab; label: string }> = [
  { id: "metrics", label: "Metrics" },
  { id: "memory", label: "Memory" },
  { id: "generated", label: "Generated Files" },
  { id: "summary", label: "Summary" },
  { id: "inspector", label: "Inspector" },
];

const OVERFLOW_TAB_IDS = new Set<CenterTab>(OVERFLOW_TABS.map((tab) => tab.id));

/**
 * Center workbench — editor, execution dashboard, preview, and run observability tabs.
 */
export function CenterWorkbench() {
  const {
    centerTab,
    setCenterTab,
    previewTabNonce,
    reviewing,
    pendingPatch,
    planApplySession,
    planApplyReviewing,
    aiPatchSession,
    activeFile,
    project,
    patchStatus,
    patchError,
    aiPatchApproved,
    aiPatchApplyStatus,
    aiPatchApplyError,
    canUndo,
    approveAIPatch,
    discardAIPatchApproval,
    applyAIPatch,
    undoLastEdit,
    runVerification,
    verifyStatus,
    startUiAuditAdvisoryFix,
    agentWorkflowBusy,
    greenfieldRun,
    activeAgentRunId,
    buildRunning,
    pipelineRunning,
    lockInspectorRun,
    setCenterInspectorActive,
    projectIntelligence,
    startPreferredMemoryFix,
    continueBuildAfterReview,
    cancelBuildLoop,
    retryApplyPlanReview,
    selectPlanApplyFile,
    setPlanApplyFileDecision,
    approveAllPlanApplyFiles,
    applyApprovedPlanFiles,
  } = useWorkspace();

  const { runStatus, dashboard } = useAgentRunViewModel();
  const handleFixUiAuditAdvisory = useCallback(() => {
    if (!dashboard.uiAuditAdvisory) return;
    void startUiAuditAdvisoryFix(dashboard.uiAuditAdvisory);
  }, [dashboard.uiAuditAdvisory, startUiAuditAdvisoryFix]);
  const selectedArtifact = useSelectedAgentArtifact();
  const liveDiffs = useLiveRunDiffs();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useExecutionDashboardTab({
    centerTab,
    setCenterTab,
    greenfieldRun,
    activeAgentRunId,
    buildRunning,
    pipelineRunning,
  });

  useEffect(() => {
    if (centerTab === "inspector") {
      const runId = activeAgentRunId ?? greenfieldRun.runTimeline?.runId ?? null;
      setCenterInspectorActive(runId);
      if (runId) lockInspectorRun(runId);
      return;
    }
    setCenterInspectorActive(null);
  }, [
    activeAgentRunId,
    centerTab,
    greenfieldRun.runTimeline?.runId,
    lockInspectorRun,
    setCenterInspectorActive,
  ]);

  useEffect(() => {
    if (runStatus.isActive) return;
    if (previewTabNonce > 0) setCenterTab("preview");
  }, [previewTabNonce, setCenterTab, runStatus.isActive]);

  useEffect(() => {
    if (runStatus.isActive) return;
    if (reviewing && pendingPatch) setCenterTab("diff");
  }, [reviewing, pendingPatch, setCenterTab, runStatus.isActive]);

  useEffect(() => {
    if (planApplySession?.phase !== "waiting_for_review") return;
    const ready = planApplySession.files.some(
      (f) => f.status === "ready" && f.diffStats?.changed,
    );
    if (ready) setCenterTab("diff");
  }, [planApplySession, setCenterTab]);

  useEffect(() => {
    if (!moreOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!moreRef.current?.contains(event.target as Node)) {
        setMoreOpen(false);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [moreOpen]);

  const planApplySelected =
    planApplySession?.files.find(
      (f) => f.relPath === planApplySession.selectedRelPath,
    ) ?? null;

  const planApplyChangedFiles =
    planApplySession?.files.filter(
      (f) => f.status === "ready" && f.diffStats?.changed,
    ) ?? [];

  const showPlanApplyCenterReview =
    planApplyReviewing &&
    planApplyChangedFiles.length > 0 &&
    (planApplySession?.phase === "review" ||
      planApplySession?.phase === "waiting_for_review");

  const aiPatchForEditor =
    aiPatchSession?.patch.ok &&
    aiPatchSession.patch.proposal &&
    activeFile &&
    project
      ? (() => {
          const abs = activeFile.node.path;
          const rel = abs.startsWith(project.path)
            ? abs.slice(project.path.length).replace(/^[/\\]+/, "")
            : activeFile.node.name;
          return aiPatchSession.relPath === rel ? aiPatchSession : null;
        })()
      : null;

  useEffect(() => {
    if (runStatus.isActive) return;
    if (aiPatchForEditor) setCenterTab("diff");
  }, [aiPatchForEditor, runStatus.isActive, setCenterTab]);

  useEffect(() => {
    if (aiPatchApplyStatus !== "applied") return;
    setCenterTab("editor");
  }, [aiPatchApplyStatus, setCenterTab]);

  const overflowActive = OVERFLOW_TAB_IDS.has(centerTab);

  return (
    <section className="panel panel--center" aria-label="Workbench">
      <header className="center-tabs" role="tablist">
        {PRIMARY_TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={centerTab === id}
            className={`center-tabs__tab${centerTab === id ? " center-tabs__tab--on" : ""}${id === "execution" && runStatus.isActive ? " center-tabs__tab--live" : ""}`}
            onClick={() => {
              setMoreOpen(false);
              setCenterTab(id);
            }}
          >
            {label}
          </button>
        ))}
        <div className="center-tabs__more" ref={moreRef}>
          <button
            type="button"
            role="tab"
            aria-selected={overflowActive}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            className={`center-tabs__tab center-tabs__tab--more${overflowActive ? " center-tabs__tab--on" : ""}`}
            onClick={() => setMoreOpen((open) => !open)}
          >
            More ▾
          </button>
          {moreOpen ? (
            <div className="center-tabs__menu" role="menu">
              {OVERFLOW_TABS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  role="menuitem"
                  className={`center-tabs__menu-item${centerTab === id ? " center-tabs__menu-item--on" : ""}`}
                  onClick={() => {
                    setCenterTab(id);
                    setMoreOpen(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </header>
      <div className="panel__body center-panel__body">
        {centerTab === "editor" ? (
          <EditorPanel embedded />
        ) : centerTab === "execution" ? (
          <ViewSuspense>
            <LazyExecutionDashboard
              viewModel={dashboard}
              onFixUiAuditAdvisory={handleFixUiAuditAdvisory}
              runActive={runStatus.isActive}
              fixRunning={agentWorkflowBusy}
            />
          </ViewSuspense>
        ) : centerTab === "preview" ? (
          <ViewSuspense>
            <LazyPreviewView />
          </ViewSuspense>
        ) : centerTab === "generated" ? (
          <ViewSuspense>
            <LazyGeneratedFilesView />
          </ViewSuspense>
        ) : centerTab === "diff" ? (
          pendingPatch && reviewing ? (
            <div className="center-diff">
              <DiffView patch={pendingPatch} />
            </div>
          ) : aiPatchForEditor ? (
            <div className="center-diff center-diff--ai-patch">
              <DiffRowsView
                before={aiPatchForEditor.basisContent}
                after={aiPatchForEditor.patch.proposal!.newContent}
                description={`AI patch: ${aiPatchForEditor.relPath}`}
              />
              {activeFile ? (
                <AIPatchReviewActions
                  session={aiPatchForEditor}
                  currentOnDisk={activeFile.result.content}
                  approved={aiPatchApproved}
                  applyStatus={aiPatchApplyStatus}
                  applyError={aiPatchApplyError}
                  patchError={patchError}
                  canUndo={canUndo}
                  verifyStatus={verifyStatus}
                  onApprove={approveAIPatch}
                  onDiscardApproval={discardAIPatchApproval}
                  onApply={() => void applyAIPatch()}
                  onUndo={() => void undoLastEdit()}
                  onVerify={() => void runVerification()}
                  compact
                />
              ) : null}
            </div>
          ) : patchStatus === "error" && patchError ? (
            <EmptyState
              title="AI patch failed"
              description={patchError}
            />
          ) : showPlanApplyCenterReview && planApplySession ? (
            <div className="center-diff center-diff--plan-apply">
              <PatchReviewPanel
                kind="plan_apply"
                layout="center"
                phase={planApplySession.phase}
                planSummary={planApplySession.planSummary ?? null}
                changedFiles={planApplyChangedFiles}
                selectedRelPath={
                  planApplySession.selectedRelPath ??
                  planApplyChangedFiles[0]?.relPath ??
                  null
                }
                error={null}
                onAcceptAll={() => {
                  approveAllPlanApplyFiles();
                  void continueBuildAfterReview();
                }}
                onRejectAll={() => cancelBuildLoop()}
                onRegenerate={() => void retryApplyPlanReview()}
                onApplyApproved={() => void applyApprovedPlanFiles()}
                onSelectFile={selectPlanApplyFile}
                onAcceptFile={(relPath) =>
                  setPlanApplyFileDecision(relPath, "approved")
                }
                onRejectFile={(relPath) =>
                  setPlanApplyFileDecision(relPath, "rejected")
                }
              />
            </div>
          ) : planApplySelected?.basisContent !== undefined &&
            planApplySelected.proposal ? (
            <div className="center-diff">
              <DiffRowsView
                before={planApplySelected.basisContent}
                after={planApplySelected.proposal.newContent}
                description={`Plan apply: ${planApplySelected.relPath}`}
              />
            </div>
          ) : selectedArtifact && artifactHasDiffContent(selectedArtifact) ? (
            <div className="center-diff">
              <ArtifactDiffView artifact={selectedArtifact} />
            </div>
          ) : liveDiffs.length > 0 ? (
            <div className="center-diff">
              <LiveRunDiffView diffs={liveDiffs} />
            </div>
          ) : planApplyReviewing ? (
            <EmptyState
              title="No diff selected"
              description="Select a file in Apply Plan to review its diff here."
            />
          ) : (
            <EmptyState
              title="No patch to review"
              description="Select a run in chat or start a patch review to see diffs here."
            />
          )
        ) : centerTab === "summary" ? (
          <ViewSuspense>
            <LazyGreenfieldSummaryView />
          </ViewSuspense>
        ) : centerTab === "studioLog" ? (
          <ViewSuspense>
            <LazyGreenfieldLogsView />
          </ViewSuspense>
        ) : centerTab === "inspector" ? (
          <ViewSuspense>
            <LazyGreenfieldInspectorView />
          </ViewSuspense>
        ) : centerTab === "metrics" ? (
          <AgentRunMetricsView />
        ) : centerTab === "memory" ? (
          <ProjectIntelligenceMemoryView
            intelligence={projectIntelligence}
            {...(project?.name ? { projectName: project.name } : {})}
            onApplyPreferredFix={(rec) => void startPreferredMemoryFix(rec)}
            applyRunning={agentWorkflowBusy}
          />
        ) : null}
      </div>
    </section>
  );
}
