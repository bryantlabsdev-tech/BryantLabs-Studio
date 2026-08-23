import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { useAgentRunViewModel } from "@/app/workspace/useAgentRunViewModel";
import { useExecutionDashboardTab } from "@/app/workspace/useExecutionDashboardTab";
import {
  evaluateWorkbenchAutoTab,
  INITIAL_WORKBENCH_AUTO_TAB_STATE,
} from "@/app/workspace/workbenchAutoTabPolicy";
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
  LazyPipelineInspectorView,
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
  { id: "metrics", label: "Run Metrics" },
  { id: "memory", label: "Project Intelligence" },
  { id: "generated", label: "Generated Files" },
  { id: "summary", label: "Summary" },
  { id: "inspector", label: "Run Trace" },
  { id: "pipelineInspector", label: "Pipeline Diagnostics" },
];

const OVERFLOW_TAB_IDS = new Set<CenterTab>(OVERFLOW_TABS.map((tab) => tab.id));

function tabPanelId(tab: CenterTab): string {
  return `center-tabpanel-${tab}`;
}

function tabButtonId(tab: CenterTab): string {
  return `center-tab-${tab}`;
}

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
    inspectorSession,
    projectIntelligence,
    startPreferredMemoryFix,
    continueBuildAfterReview,
    cancelBuildLoop,
    retryApplyPlanReview,
    selectPlanApplyFile,
    setPlanApplyFileDecision,
    setPlanApplyFilePartialContent,
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
  const tablistId = useId();

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
      if (!inspectorSession.centerInspectorActive) {
        setCenterInspectorActive(runId);
      }
      if (runId && inspectorSession.lockedRunId !== runId) {
        lockInspectorRun(runId);
      }
      return;
    }
    if (inspectorSession.centerInspectorActive) {
      setCenterInspectorActive(null);
    }
  }, [
    activeAgentRunId,
    centerTab,
    greenfieldRun.runTimeline?.runId,
    inspectorSession.centerInspectorActive,
    inspectorSession.lockedRunId,
    lockInspectorRun,
    setCenterInspectorActive,
  ]);

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

  const hasAiPatchForEditor = Boolean(aiPatchForEditor);
  const reviewingPendingPatch = Boolean(reviewing && pendingPatch);
  const autoTabStateRef = useRef(INITIAL_WORKBENCH_AUTO_TAB_STATE);
  const centerTabRef = useRef(centerTab);
  centerTabRef.current = centerTab;
  useEffect(() => {
    const result = evaluateWorkbenchAutoTab(autoTabStateRef.current, {
      previewTabNonce,
      reviewingPendingPatch,
      aiPatchForEditor: hasAiPatchForEditor,
      aiPatchApplied: aiPatchApplyStatus === "applied",
    });
    autoTabStateRef.current = result.nextState;
    if (result.tabToSet && result.tabToSet !== centerTabRef.current) {
      setCenterTab(result.tabToSet);
    }
  }, [
    aiPatchApplyStatus,
    hasAiPatchForEditor,
    reviewingPendingPatch,
    previewTabNonce,
    setCenterTab,
  ]);

  const overflowActive = OVERFLOW_TAB_IDS.has(centerTab);
  const activeOverflowLabel = OVERFLOW_TABS.find((tab) => tab.id === centerTab)?.label;
  const tabPanelLabelledBy = overflowActive ? "center-tab-more" : tabButtonId(centerTab);

  const onTabKeyDown = useCallback(
    (event: React.KeyboardEvent, currentId: CenterTab | "more") => {
      const order = [...PRIMARY_TABS.map((t) => t.id), "more" as const];
      const idx = order.indexOf(currentId);
      if (idx < 0) return;
      let nextIdx = idx;
      if (event.key === "ArrowRight") nextIdx = (idx + 1) % order.length;
      else if (event.key === "ArrowLeft") nextIdx = (idx - 1 + order.length) % order.length;
      else if (event.key === "Home") nextIdx = 0;
      else if (event.key === "End") nextIdx = order.length - 1;
      else return;
      event.preventDefault();
      const next = order[nextIdx];
      if (next === "more") {
        setMoreOpen(true);
        return;
      }
      setMoreOpen(false);
      setCenterTab(next);
    },
    [setCenterTab],
  );

  const renderTabPanel = () => {
    switch (centerTab) {
      case "editor":
        return <EditorPanel embedded />;
      case "execution":
        return (
          <ViewSuspense>
            <LazyExecutionDashboard
              viewModel={dashboard}
              onFixUiAuditAdvisory={handleFixUiAuditAdvisory}
              runActive={runStatus.isActive}
              fixRunning={agentWorkflowBusy}
            />
          </ViewSuspense>
        );
      case "preview":
        return (
          <ViewSuspense>
            <LazyPreviewView />
          </ViewSuspense>
        );
      case "generated":
        return (
          <ViewSuspense>
            <LazyGeneratedFilesView />
          </ViewSuspense>
        );
      case "diff":
        if (pendingPatch && reviewing) {
          return (
            <div className="center-diff">
              <DiffView patch={pendingPatch} />
            </div>
          );
        }
        if (aiPatchForEditor) {
          return (
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
          );
        }
        if (patchStatus === "error" && patchError) {
          return <EmptyState title="AI patch failed" description={patchError} />;
        }
        if (showPlanApplyCenterReview && planApplySession) {
          return (
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
                onPartialContentChange={setPlanApplyFilePartialContent}
                hunkReview
              />
            </div>
          );
        }
        if (
          planApplySelected?.basisContent !== undefined &&
          planApplySelected.proposal
        ) {
          return (
            <div className="center-diff">
              <DiffRowsView
                before={planApplySelected.basisContent}
                after={planApplySelected.proposal.newContent}
                description={`Plan apply: ${planApplySelected.relPath}`}
              />
            </div>
          );
        }
        if (selectedArtifact && artifactHasDiffContent(selectedArtifact)) {
          return (
            <div className="center-diff">
              <ArtifactDiffView artifact={selectedArtifact} />
            </div>
          );
        }
        if (liveDiffs.length > 0) {
          return (
            <div className="center-diff">
              <LiveRunDiffView diffs={liveDiffs} />
            </div>
          );
        }
        if (planApplyReviewing) {
          return (
            <EmptyState
              title="No diff selected"
              description="Select a file in Apply Plan to review its diff here."
            />
          );
        }
        return (
          <EmptyState
            title="No patch to review"
            description="Select a run in chat or start a patch review to see diffs here."
          />
        );
      case "summary":
        return (
          <ViewSuspense>
            <LazyGreenfieldSummaryView />
          </ViewSuspense>
        );
      case "studioLog":
        return (
          <ViewSuspense>
            <LazyGreenfieldLogsView />
          </ViewSuspense>
        );
      case "inspector":
        return (
          <ViewSuspense>
            <LazyGreenfieldInspectorView />
          </ViewSuspense>
        );
      case "pipelineInspector":
        return (
          <ViewSuspense>
            <LazyPipelineInspectorView />
          </ViewSuspense>
        );
      case "metrics":
        return <AgentRunMetricsView />;
      case "memory":
        return (
          <ProjectIntelligenceMemoryView
            intelligence={projectIntelligence}
            {...(project?.name ? { projectName: project.name } : {})}
            onApplyPreferredFix={(rec) => void startPreferredMemoryFix(rec)}
            applyRunning={agentWorkflowBusy}
          />
        );
      default:
        return null;
    }
  };

  return (
    <section className="panel panel--center" aria-label="Workbench">
      <header className="center-tabs">
        <div
          className="center-tabs__list"
          role="tablist"
          id={tablistId}
          aria-label="Workbench tabs"
        >
          {PRIMARY_TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              id={tabButtonId(id)}
              aria-selected={centerTab === id}
              aria-controls={tabPanelId(id)}
              tabIndex={centerTab === id ? 0 : -1}
              className={`center-tabs__tab${centerTab === id ? " center-tabs__tab--on" : ""}${id === "execution" && runStatus.isActive ? " center-tabs__tab--live" : ""}`}
              onClick={() => {
                setMoreOpen(false);
                setCenterTab(id);
              }}
              onKeyDown={(e) => onTabKeyDown(e, id)}
            >
              {label}
            </button>
          ))}
          <div className="center-tabs__more" ref={moreRef}>
            <button
              type="button"
              role="tab"
              id="center-tab-more"
              aria-selected={overflowActive}
              aria-expanded={moreOpen}
              aria-haspopup="menu"
              aria-controls={moreOpen ? "center-tabs-overflow-menu" : undefined}
              tabIndex={overflowActive ? 0 : -1}
              className={`center-tabs__tab center-tabs__tab--more${overflowActive ? " center-tabs__tab--on" : ""}`}
              onClick={() => setMoreOpen((open) => !open)}
              onKeyDown={(e) => onTabKeyDown(e, "more")}
            >
              {overflowActive && activeOverflowLabel
                ? `${activeOverflowLabel} ▾`
                : "More ▾"}
            </button>
            {moreOpen ? (
              <div
                id="center-tabs-overflow-menu"
                className="center-tabs__menu"
                role="menu"
              >
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
        </div>
      </header>
      <div
        className="panel__body center-panel__body"
        role="tabpanel"
        id={tabPanelId(centerTab)}
        aria-labelledby={tabPanelLabelledBy}
      >
        {renderTabPanel()}
      </div>
    </section>
  );
}
