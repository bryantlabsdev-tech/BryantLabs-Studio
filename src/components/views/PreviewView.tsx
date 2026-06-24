import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { usePreviewAncestorAudit } from "@/hooks/usePreviewAncestorAudit";
import { usePreviewFrameSize } from "@/hooks/usePreviewFrameSize";
import { PreviewAncestorAuditPanel } from "@/components/preview/PreviewAncestorAuditPanel";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { EmptyState } from "@/components/EmptyState";
import { createLatestAction } from "@/core/greenfield/runLog";
import type {
  GreenfieldPreviewProbeResult,
  PreviewDiagnostics,
  PreviewProbeErrorKind,
} from "@/core/greenfield/types";
import {
  buildPreviewFailureReport,
  formatPreviewDiagnosticsCopy,
  formatViteConfigDiagnosticsCopy,
} from "@/core/preview/diagnostics";
import { normalizePreviewUrl } from "@/core/preview/normalizePreviewUrl";
import { enableAdvancedPreviewControls } from "@/core/preview/viewport";
import { PreviewViewportControlsBar } from "@/components/preview/PreviewViewportControlsBar";

export { normalizePreviewUrl } from "@/core/preview/normalizePreviewUrl";
import type { ViteConfigDiagnostics } from "@/core/greenfield/types";

type FrameLoadState = "idle" | "loading" | "loaded" | "failed";

function previewPortFromUrl(url: string | null): number {
  if (!url) return 4173;
  try {
    const p = new URL(url).port;
    return p ? Number(p) : 4173;
  } catch {
    return 4173;
  }
}

function defaultPreviewUrl(port: number): string {
  return `http://127.0.0.1:${port}/`;
}

/** Chromium / Electron load errors that are not a failed main navigation. */
function isIgnorableWebviewLoadError(ev: {
  errorCode?: number;
  isMainFrame?: boolean;
}): boolean {
  if (ev.isMainFrame === false) return true;
  // ERR_ABORTED — in-flight navigation replaced; not a dead server.
  if (ev.errorCode === -3) return true;
  return false;
}

/**
 * Preview panel — embeds the Vite preview server when the probe returns HTTP 2xx/3xx.
 */
export function PreviewView() {
  const {
    appPreview,
    project,
    setAppPreview,
    setDockTab,
    openDock,
    appendGreenfieldRunLog,
    updateGreenfieldRun,
    publishFailureReport,
    greenfieldRun,
    setCenterTab,
    openDeveloperConsole,
    triggerGreenfieldRepair,
  } = useWorkspace();
  const api = window.bryantlabs;
  const isDesktop = api?.isDesktop === true;

  const [url, setUrl] = useState<string | null>(
    appPreview.url ? normalizePreviewUrl(appPreview.url) : null,
  );
  const [previewRoot, setPreviewRoot] = useState<string | null>(appPreview.root);
  const [studioProcessRunning, setStudioProcessRunning] = useState(
    appPreview.running,
  );
  const [processExited, setProcessExited] = useState(false);
  const [port, setPort] = useState<number | null>(appPreview.port);
  const [lastSuccessfulPreviewAt, setLastSuccessfulPreviewAt] = useState<number | null>(
    appPreview.lastSuccessfulPreviewAt,
  );
  const [reloadKey, setReloadKey] = useState(0);
  const [frameState, setFrameState] = useState<FrameLoadState>("idle");
  const [frameError, setFrameError] = useState<string | null>(null);
  const [probe, setProbe] = useState<GreenfieldPreviewProbeResult | null>(null);
  const [probeUrl, setProbeUrl] = useState<string | null>(null);
  const [probing, setProbing] = useState(false);
  const [previewAction, setPreviewAction] = useState<"idle" | "starting">("idle");
  const [previewActionError, setPreviewActionError] = useState<string | null>(null);
  const [spawnDiagnostics, setSpawnDiagnostics] = useState<PreviewDiagnostics | null>(
    null,
  );
  const [consoleLines, setConsoleLines] = useState<
    readonly { level: number; message: string; at: string }[]
  >([]);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const webviewRef = useRef<
    HTMLElement & {
      reload(): void;
      executeJavaScript(code: string, userGesture?: boolean): Promise<unknown>;
    }
  | null>(null);
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const previewRootRef = useRef<HTMLDivElement | null>(null);
  const previewToolbarRef = useRef<HTMLDivElement | null>(null);
  const previewMainRef = useRef<HTMLDivElement | null>(null);
  const frameContainerRef = useRef<HTMLDivElement | null>(null);

  const projectRoot = previewRoot ?? project?.path ?? null;
  const displayPort = port ?? previewPortFromUrl(url);

  const runProbe = useCallback(
    async (raw: string) => {
      if (!api?.greenfieldPreviewProbe) return;
      const target = normalizePreviewUrl(raw);
      setProbing(true);
      setProbe(null);
      setProbeUrl(target);
      try {
        const result = await api.greenfieldPreviewProbe(target);
        setProbe(result);
      } finally {
        setProbing(false);
      }
    },
    [api],
  );

  const syncPreviewState = useCallback(async () => {
    if (!api?.greenfieldPreviewState) return;
    const s = await api.greenfieldPreviewState();
    setStudioProcessRunning(s.running);
    setProcessExited(s.processExited);
    setPort(s.port);
    if (s.lastSuccessfulPreviewAt) {
      const ms = Date.parse(s.lastSuccessfulPreviewAt);
      if (!Number.isNaN(ms)) setLastSuccessfulPreviewAt(ms);
    }
    if (s.root) setPreviewRoot(s.root);
    if (s.url) {
      setUrl(normalizePreviewUrl(s.url));
    }
    if (s.lastFailureDiagnostics) {
      setSpawnDiagnostics(s.lastFailureDiagnostics);
    }
  }, [api]);

  const hardReload = useCallback(() => {
    const target =
      url ?? (displayPort ? defaultPreviewUrl(displayPort) : null);
    if (!target) return;
    setFrameState("loading");
    setFrameError(null);
    setPreviewActionError(null);
    setProbe(null);
    setReloadKey((k) => k + 1);
    void runProbe(target);
    webviewRef.current?.reload();
  }, [url, displayPort, runProbe]);

  useEffect(() => {
    if (appPreview.url) setUrl(normalizePreviewUrl(appPreview.url));
    setStudioProcessRunning(appPreview.running);
    if (appPreview.root) setPreviewRoot(appPreview.root);
    if (appPreview.port !== null) setPort(appPreview.port);
    if (appPreview.lastSuccessfulPreviewAt !== null) {
      setLastSuccessfulPreviewAt(appPreview.lastSuccessfulPreviewAt);
    }
  }, [
    appPreview.url,
    appPreview.running,
    appPreview.root,
    appPreview.port,
    appPreview.lastSuccessfulPreviewAt,
  ]);

  useEffect(() => {
    void syncPreviewState();
    const id = setInterval(() => void syncPreviewState(), 3000);
    return () => clearInterval(id);
  }, [syncPreviewState]);

  useEffect(() => {
    const target = url ?? defaultPreviewUrl(displayPort);
    if (!url && projectRoot) {
      setUrl(target);
    }
  }, [url, projectRoot, displayPort]);

  useEffect(() => {
    const target = url ?? defaultPreviewUrl(displayPort);
    if (!projectRoot && !url) {
      setProbe(null);
      setFrameState("idle");
      return;
    }
    setFrameState("loading");
    setFrameError(null);
    void runProbe(target);
  }, [url, reloadKey, runProbe, displayPort, projectRoot]);

  const httpReady = probe?.ok === true;
  const frameSrc = url ? normalizePreviewUrl(url) : null;
  const showFrame = Boolean(frameSrc && httpReady && frameState !== "failed");
  const mountFrame = showFrame;

  const frameRef = (isDesktop ? webviewRef : iframeRef) as RefObject<
    HTMLElement | null
  >;

  usePreviewFrameSize({
    containerRef: frameContainerRef,
    frameRef,
    previewRootRef,
    toolbarRef: previewToolbarRef,
    mainRef: previewMainRef,
    active: showFrame,
    layoutKey:
      reloadKey +
      (diagnosticsOpen ? 1 : 0) +
      (projectRoot ? 1 : 0),
  });

  const ancestorAudit = usePreviewAncestorAudit(frameRef, showFrame, reloadKey);

  useEffect(() => {
    if (!mountFrame || !isDesktop) return;

    let disposed = false;
    let cleanup: (() => void) | undefined;

    const attachListeners = () => {
      const el = webviewRef.current;
      if (!el || disposed) return;

      const markLoaded = () => {
        setFrameState("loaded");
        setFrameError(null);
        if (url) void runProbe(url);
      };

      const onConsole = (event: Event) => {
        const ev = event as Event & { level?: number; message?: string };
        setConsoleLines((prev) => [
          ...prev.slice(-19),
          {
            level: ev.level ?? 0,
            message: ev.message ?? "",
            at: new Date().toISOString(),
          },
        ]);
      };

      const onStart = () => {
        setFrameState("loading");
        setFrameError(null);
      };

      const onFail = (event: Event) => {
        const ev = event as Event & {
          errorCode?: number;
          errorDescription?: string;
          validatedURL?: string;
          isMainFrame?: boolean;
        };
        if (isIgnorableWebviewLoadError(ev)) return;
        setFrameState("failed");
        setFrameError(
          `Load failed (${ev.errorCode ?? "?"}): ${ev.errorDescription ?? "unknown"} — ${ev.validatedURL ?? url ?? ""}`,
        );
      };

      el.addEventListener("did-start-loading", onStart);
      el.addEventListener("did-finish-load", markLoaded);
      el.addEventListener("dom-ready", markLoaded);
      el.addEventListener("did-fail-load", onFail);
      el.addEventListener("console-message", onConsole);

      cleanup = () => {
        el.removeEventListener("did-start-loading", onStart);
        el.removeEventListener("did-finish-load", markLoaded);
        el.removeEventListener("dom-ready", markLoaded);
        el.removeEventListener("did-fail-load", onFail);
        el.removeEventListener("console-message", onConsole);
      };
    };

    const frameId = requestAnimationFrame(attachListeners);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      cleanup?.();
    };
  }, [mountFrame, url, reloadKey, isDesktop, runProbe]);

  useEffect(() => {
    if (!mountFrame || frameState === "loaded" || frameState === "failed") {
      return;
    }
    const t = window.setTimeout(() => {
      setFrameState((prev) => {
        if (prev !== "loading") return prev;
        setFrameError("Preview is taking longer than expected. Try Hard reload or open in browser.");
        return "failed";
      });
    }, 15_000);
    return () => window.clearTimeout(t);
  }, [mountFrame, reloadKey, frameState]);

  const startOrRestartPreview = async () => {
    if (!projectRoot || !api?.greenfieldPreviewStart) return;
    if (
      greenfieldRun.actionType === "greenfield" &&
      greenfieldRun.setupStatus === "error" ||
      greenfieldRun.setupStatus === "repair_needed" ||
      greenfieldRun.setupStatus === "repairing"
    ) {
      const blocked =
        greenfieldRun.failureReport?.rootCauseLine ??
        greenfieldRun.finalMessage ??
        "Fix npm install, TypeScript, and build errors before starting preview.";
      setPreviewActionError(blocked);
      appendGreenfieldRunLog("preview", "failed", "Preview blocked", blocked);
      updateGreenfieldRun({
        actionType: "preview",
        runResult: "failed",
        workflow: { previewResult: `blocked: ${blocked}`, errors: [blocked] },
        latestAction: createLatestAction("failed", "Preview blocked", {
          stage: "preview",
          detail: blocked,
        }),
      });
      return;
    }
    setPreviewAction("starting");
    setPreviewActionError(null);
    setSpawnDiagnostics(null);
    setFrameState("loading");
    setProbe(null);
    appendGreenfieldRunLog("preview", "running", "Preview starting", projectRoot);
    updateGreenfieldRun({
      actionType: "preview",
      projectPath: projectRoot,
      targetFolder: projectRoot,
      runStartedAt: Date.now(),
      runResult: "running",
    });
    try {
      const res = await api.greenfieldPreviewStart(projectRoot);
      if (res.ok && res.url) {
        const normalized = normalizePreviewUrl(res.url);
        const p = previewPortFromUrl(normalized);
        const at = Date.now();
        setAppPreview({
          url: normalized,
          running: true,
          root: projectRoot,
          lastSuccessfulPreviewAt: at,
          port: p,
        });
        setUrl(normalized);
        setStudioProcessRunning(true);
        setProcessExited(false);
        setPort(p);
        setLastSuccessfulPreviewAt(at);
        setReloadKey((k) => k + 1);
        setSpawnDiagnostics(null);
        appendGreenfieldRunLog("preview", "success", "Preview started", normalized);
        updateGreenfieldRun({
          actionType: "preview",
          runResult: "success",
          lastSuccessfulRunAt: at,
          failureReport: null,
          workflow: { previewResult: `running: ${normalized}` },
          latestAction: createLatestAction("success", "Preview started", {
            stage: "preview",
            detail: normalized,
          }),
        });
      } else {
        const err =
          res.diagnostics?.rootCause ?? res.error ?? "Preview failed to start.";
        if (res.diagnostics) setSpawnDiagnostics(res.diagnostics);
        setPreviewActionError(err);
        setStudioProcessRunning(false);
        setAppPreview({ url: null, running: false, root: projectRoot });
        setUrl(null);
        if (res.diagnostics) {
          const report = buildPreviewFailureReport(res.diagnostics);
          publishFailureReport(report);
          updateGreenfieldRun({
            actionType: "preview",
            projectPath: projectRoot,
            runResult: "failed",
            workflow: { previewResult: `failed: ${err}`, errors: [err] },
          });
        } else {
          appendGreenfieldRunLog("preview", "failed", "Preview failed to start", err);
          updateGreenfieldRun({
            actionType: "preview",
            runResult: "failed",
            workflow: { previewResult: `failed: ${err}`, errors: [err] },
            latestAction: createLatestAction("failed", "Preview failed to start", {
              stage: "preview",
              detail: err,
            }),
          });
        }
      }
    } catch (err) {
      const msg =
        err instanceof Error ? err.message : "Preview failed to start.";
      setPreviewActionError(msg);
      appendGreenfieldRunLog("preview", "failed", "Preview failed to start", msg);
      updateGreenfieldRun({
        actionType: "preview",
        runResult: "failed",
        workflow: { previewResult: `failed: ${msg}`, errors: [msg] },
        latestAction: createLatestAction("failed", "Preview failed to start", {
          stage: "preview",
          detail: msg,
        }),
      });
    } finally {
      setPreviewAction("idle");
    }
  };

  const stopPreview = async () => {
    appendGreenfieldRunLog("preview", "running", "Preview stopping");
    try {
      await api?.greenfieldPreviewStop();
      setAppPreview({
        url: null,
        running: false,
        root: projectRoot,
        lastSuccessfulPreviewAt: appPreview.lastSuccessfulPreviewAt,
        port: null,
      });
      setUrl(null);
      setStudioProcessRunning(false);
      appendGreenfieldRunLog("preview", "success", "Preview stopped");
      updateGreenfieldRun({
        actionType: "preview",
        runResult: "success",
        workflow: { previewResult: "stopped" },
        latestAction: createLatestAction("success", "Preview stopped", {
          stage: "preview",
        }),
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Preview stop failed";
      appendGreenfieldRunLog("error", "failed", "Preview stop failed", msg);
      updateGreenfieldRun({
        runResult: "failed",
        workflow: { errors: [msg] },
        latestAction: createLatestAction("failed", "Preview stop failed", {
          stage: "preview",
          detail: msg,
        }),
      });
    }
  };

  const openInBrowser = () => {
    const target = url ?? (httpReady ? probeUrl : null);
    if (!target || !api?.greenfieldPreviewOpenExternal) return;
    void api.greenfieldPreviewOpenExternal(target);
  };

  if (!url && !project) {
    return (
      <EmptyState
        title="No preview"
        description="Create a new app with the New App wizard, or open a project with a preview script."
      />
    );
  }

  const setupBlocked =
    greenfieldRun.setupStatus === "error" ||
    greenfieldRun.setupStatus === "repair_needed";
  const setupErrorLine =
    greenfieldRun.failureReport?.rootCauseLine ??
    greenfieldRun.finalMessage ??
    null;

  const showOffline =
    !showFrame &&
    !probing &&
    !httpReady &&
    Boolean(
      (probe !== null && !probe.ok) ||
        (!url && projectRoot) ||
        frameState === "failed",
    );

  const showLoading =
    !showFrame &&
    !showOffline &&
    Boolean(url && (probing || httpReady || frameState === "loading"));

  const showFrameError =
    !showFrame &&
    frameState === "failed" &&
    httpReady &&
    Boolean(frameError);

  const lastError =
    spawnDiagnostics?.rootCause ??
    previewActionError ??
    frameError ??
    (probe && !probe.ok ? probe.error ?? probeErrorMessage(probe.errorKind) : null);

  const offlineReason = resolveOfflineReason({
    studioProcessRunning,
    processExited,
    probe,
    probing,
    frameState,
    frameError,
    previewActionError,
    spawnRootCause: spawnDiagnostics?.rootCause ?? null,
  });

  const CONSOLE_LEVEL_LABEL: Record<number, string> = {
    0: "verbose",
    1: "info",
    2: "warn",
    3: "error",
  };

  return (
    <div ref={previewRootRef} className="preview-view" data-testid="preview-view-root">
      <div ref={previewToolbarRef} className="preview-toolbar">
        <div className="preview-panel__bar">
          <span className="preview-panel__label">Preview</span>
          {frameSrc && httpReady ? (
            <a
              className="preview-panel__url"
              data-testid="preview-panel-url"
              href={frameSrc}
              target="_blank"
              rel="noreferrer"
            >
              {frameSrc}
            </a>
          ) : (
            <span
              className="preview-panel__url preview-panel__url--muted"
              data-testid="preview-panel-url"
            >
              {frameSrc ?? defaultPreviewUrl(displayPort)}
            </span>
          )}
          {frameSrc ? (
            <>
              <button type="button" className="prov-btn" onClick={() => hardReload()}>
                Hard reload
              </button>
              {showFrame ? (
                <button
                  type="button"
                  className="prov-btn"
                  onClick={() => {
                    setReloadKey((k) => k + 1);
                    setFrameState("loading");
                    if (url) void runProbe(url);
                    webviewRef.current?.reload();
                    iframeRef.current?.contentWindow?.location.reload();
                  }}
                >
                  Reload preview
                </button>
              ) : null}
              <button type="button" className="prov-btn" onClick={() => openInBrowser()}>
                Open in browser
              </button>
              {studioProcessRunning ? (
                <button
                  type="button"
                  className="prov-btn"
                  onClick={() => void stopPreview()}
                >
                  Stop preview
                </button>
              ) : null}
              <button
                type="button"
                className={`prov-btn${diagnosticsOpen ? " prov-btn--active" : ""}`}
                aria-expanded={diagnosticsOpen}
                aria-controls="preview-diagnostics-drawer"
                data-testid="preview-diagnostics-toggle"
                onClick={() => setDiagnosticsOpen((open) => !open)}
              >
                {diagnosticsOpen ? "Hide diagnostics" : "Show diagnostics"}
              </button>
            </>
          ) : null}
        </div>
        {enableAdvancedPreviewControls ? <PreviewViewportControlsBar /> : null}
      </div>

      <div ref={previewMainRef} className="preview-view__main" data-testid="preview-view-main">
        <div
          ref={frameContainerRef}
          className="preview-frame-container"
          data-testid="preview-frame-container"
        >
          {showFrame && frameSrc ? (
            isDesktop ? (
              <webview
                key={`${frameSrc}-${reloadKey}`}
                ref={webviewRef}
                className="preview-frame"
                src={frameSrc}
                partition="persist:bryantlabs-preview"
                allowpopups
              />
            ) : (
              <iframe
                key={`${frameSrc}-${reloadKey}`}
                ref={iframeRef}
                className="preview-frame"
                title="App preview"
                src={frameSrc}
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals"
                scrolling="yes"
                onLoad={() => {
                  setFrameState("loaded");
                  setFrameError(null);
                  if (url) void runProbe(url);
                }}
                onError={() => {
                  setFrameState("failed");
                  setFrameError("Iframe failed to load preview URL.");
                }}
              />
            )
          ) : (
            <div
              className="preview-frame-container__status"
              role={showOffline ? "region" : "status"}
              aria-live="polite"
            >
              {showOffline ? (
                <PreviewServerOfflineCard
                  projectPath={projectRoot}
                  port={displayPort}
                  lastSuccessfulPreviewAt={lastSuccessfulPreviewAt}
                  reason={offlineReason}
                  probing={probing}
                  previewAction={previewAction}
                  setupBlocked={setupBlocked}
                  setupError={setupErrorLine}
                  repairAvailable={greenfieldRun.setupStatus === "repair_needed"}
                  onStart={() => void startOrRestartPreview()}
                  onRestart={() => void startOrRestartPreview()}
                  onOpenTerminal={() => {
                    openDock();
                    setDockTab("terminal");
                  }}
                  onViewSetupErrors={() => setCenterTab("studioLog")}
                  onOpenDeveloperConsole={() => openDeveloperConsole()}
                  onRunRepair={() => void triggerGreenfieldRepair()}
                  canStart={Boolean(projectRoot) && !setupBlocked}
                />
              ) : showFrameError ? (
                <div className="preview-panel__frame-error" role="alert">
                  <p>{frameError}</p>
                  <button type="button" className="prov-btn" onClick={() => hardReload()}>
                    Hard reload
                  </button>
                </div>
              ) : showLoading ? (
                <div className="preview-panel__loading-card">
                  <p className="preview-panel__loading-title">Loading preview…</p>
                  <p className="preview-panel__loading-hint">
                    {probing
                      ? "Checking preview server on localhost…"
                      : "Preview server responded; embedding the app."}
                  </p>
                </div>
              ) : spawnDiagnostics ? (
                <PreviewSpawnDiagnostics diagnostics={spawnDiagnostics} />
              ) : null}
            </div>
          )}
        </div>

        {diagnosticsOpen ? (
          <div
            id="preview-diagnostics-drawer"
            className="preview-view__diagnostics-drawer"
            role="region"
            aria-label="Preview diagnostics"
            data-testid="preview-diagnostics-drawer"
          >
            {spawnDiagnostics ? (
              <PreviewSpawnDiagnostics diagnostics={spawnDiagnostics} />
            ) : null}
            <PreviewAncestorAuditPanel audit={ancestorAudit} />
            <PreviewProbePanel
              previewUrl={frameSrc}
              probeUrl={probeUrl}
              probe={probe}
              probing={probing}
              frameState={frameState}
              frameSrc={frameSrc}
              studioProcessRunning={studioProcessRunning}
              processExited={processExited}
              lastError={lastError}
            />
            {showFrame && consoleLines.length > 0 ? (
              <details className="preview-panel__console">
                <summary>Preview console ({consoleLines.length})</summary>
                <ol className="preview-panel__console-list">
                  {consoleLines.map((line, i) => (
                    <li
                      key={`${line.at}-${i}`}
                      className={`preview-panel__console-line preview-panel__console-line--${CONSOLE_LEVEL_LABEL[line.level] ?? "log"}`}
                    >
                      <span className="preview-panel__console-level">
                        {CONSOLE_LEVEL_LABEL[line.level] ?? "log"}
                      </span>
                      {line.message}
                    </li>
                  ))}
                </ol>
              </details>
            ) : null}
          </div>
        ) : null}
      </div>
    </div>
  );
}

function PreviewProbePanel({
  previewUrl,
  probeUrl,
  probe,
  probing,
  frameState,
  frameSrc,
  studioProcessRunning,
  processExited,
  lastError,
}: {
  previewUrl: string | null;
  probeUrl: string | null;
  probe: GreenfieldPreviewProbeResult | null;
  probing: boolean;
  frameState: FrameLoadState;
  frameSrc: string | null;
  studioProcessRunning: boolean;
  processExited: boolean;
  lastError: string | null;
}) {
  const httpStatus =
    probing && probe === null
      ? "…"
      : probe?.httpStatus !== null && probe?.httpStatus !== undefined
        ? String(probe.httpStatus)
        : "—";

  return (
    <details className="preview-panel__diagnostics">
      <summary>Preview diagnostics</summary>
      <dl className="preview-panel__diagnostics-grid">
        <div className="preview-panel__diagnostics-row">
          <dt>Preview URL</dt>
          <dd className="preview-panel__mono">{previewUrl ?? "—"}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>Probe URL</dt>
          <dd className="preview-panel__mono">{probeUrl ?? "—"}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>Frame src</dt>
          <dd className="preview-panel__mono">{frameSrc ?? "—"}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>HTTP status</dt>
          <dd>{httpStatus}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>Probe OK</dt>
          <dd>{probing && !probe ? "…" : probe?.ok ? "yes" : "no"}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>Frame load state</dt>
          <dd>{frameState}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>Studio preview process</dt>
          <dd>
            {studioProcessRunning
              ? "running"
              : processExited
                ? "exited"
                : "not managed by Studio"}
          </dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>Advanced preview controls</dt>
          <dd>{enableAdvancedPreviewControls ? "enabled" : "disabled"}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>Last error</dt>
          <dd className="preview-panel__mono">{lastError ?? "—"}</dd>
        </div>
      </dl>
    </details>
  );
}

function PreviewSpawnDiagnostics({
  diagnostics,
}: {
  diagnostics: PreviewDiagnostics;
}) {
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const copyDiagnostics = async () => {
    try {
      await navigator.clipboard.writeText(formatPreviewDiagnosticsCopy(diagnostics));
      setCopyNote("Copied");
    } catch {
      setCopyNote("Copy failed");
    }
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  return (
    <details className="preview-panel__diagnostics preview-panel__diagnostics--failure">
      <summary>Preview failure diagnostics</summary>
      <pre className="preview-panel__root-cause preview-panel__error" role="alert">
        {diagnostics.rootCause}
      </pre>
      <div className="preview-panel__offline-actions">
        <button type="button" className="prov-btn" onClick={() => void copyDiagnostics()}>
          Copy preview diagnostics
        </button>
        {copyNote ? <span className="preview-panel__hint">{copyNote}</span> : null}
      </div>
      <dl className="preview-panel__diagnostics-grid">
        <div className="preview-panel__diagnostics-row">
          <dt>Command</dt>
          <dd className="preview-panel__mono">{diagnostics.command}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>Working directory</dt>
          <dd className="preview-panel__mono">{diagnostics.cwd}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>Port</dt>
          <dd>{diagnostics.port}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>Exit code</dt>
          <dd>{diagnostics.exitCode ?? "—"}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>Port in use</dt>
          <dd>{diagnostics.portInUse ? "yes" : "no"}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>Tried ports</dt>
          <dd>{diagnostics.triedPorts.join(", ") || "—"}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>dist/</dt>
          <dd>
            {diagnostics.distExists ? "exists" : "missing"} —{" "}
            <span className="preview-panel__mono">{diagnostics.distPath}</span>
          </dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>preview script</dt>
          <dd className="preview-panel__mono">
            {diagnostics.hasPreviewScript
              ? diagnostics.previewScript ?? "(empty)"
              : "missing"}
          </dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>First error line</dt>
          <dd className="preview-panel__mono">
            {diagnostics.firstErrorLine ?? "—"}
          </dd>
        </div>
      </dl>
      {diagnostics.viteConfig ? (
        <ViteConfigDiagnosticsPanel vite={diagnostics.viteConfig} />
      ) : null}

      <details className="preview-panel__console">
        <summary>stdout / stderr</summary>
        <pre className="gf-tsc__pre">{`--- stdout ---\n${diagnostics.stdout || "(empty)"}\n\n--- stderr ---\n${diagnostics.stderr || "(empty)"}`}</pre>
      </details>
    </details>
  );
}

function ViteConfigDiagnosticsPanel({ vite }: { vite: ViteConfigDiagnostics }) {
  const [copyNote, setCopyNote] = useState<string | null>(null);

  const copyVite = async () => {
    try {
      await navigator.clipboard.writeText(formatViteConfigDiagnosticsCopy(vite));
      setCopyNote("Copied");
    } catch {
      setCopyNote("Copy failed");
    }
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  return (
    <details className="preview-panel__diagnostics preview-panel__diagnostics--vite">
      <summary>Vite config diagnostics</summary>
      <pre className="preview-panel__root-cause">{vite.rootCauseLine}</pre>
      <div className="preview-panel__offline-actions">
        <button type="button" className="prov-btn" onClick={() => void copyVite()}>
          Copy Vite diagnostics
        </button>
        {copyNote ? <span className="preview-panel__hint">{copyNote}</span> : null}
      </div>
      <dl className="preview-panel__diagnostics-grid">
        <div className="preview-panel__diagnostics-row">
          <dt>Config file</dt>
          <dd className="preview-panel__mono">{vite.configFilePath ?? "—"}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>Imports discovered</dt>
          <dd className="preview-panel__mono">
            {vite.importsDiscovered.length
              ? vite.importsDiscovered.join(", ")
              : "—"}
          </dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>Missing imports</dt>
          <dd className="preview-panel__mono">
            {vite.missingImports.length ? vite.missingImports.join(", ") : "—"}
          </dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>Syntax parse</dt>
          <dd>{vite.syntaxParseResult}</dd>
        </div>
        <div className="preview-panel__diagnostics-row">
          <dt>First exception</dt>
          <dd className="preview-panel__mono">{vite.firstException ?? "—"}</dd>
        </div>
      </dl>
      {vite.stackTrace ? (
        <details className="preview-panel__console">
          <summary>Stack trace</summary>
          <pre className="gf-tsc__pre">{vite.stackTrace}</pre>
        </details>
      ) : null}
      <details className="preview-panel__console">
        <summary>Full Vite output</summary>
        <pre className="gf-tsc__pre">{vite.fullOutput || "(empty)"}</pre>
      </details>
    </details>
  );
}

function resolveOfflineReason(opts: {
  studioProcessRunning: boolean;
  processExited: boolean;
  probe: GreenfieldPreviewProbeResult | null;
  probing: boolean;
  frameState: FrameLoadState;
  frameError: string | null;
  previewActionError: string | null;
  spawnRootCause: string | null;
}): string {
  if (opts.spawnRootCause) return opts.spawnRootCause;
  if (opts.previewActionError) return opts.previewActionError;
  if (opts.probing) return "Checking whether the preview server is reachable…";
  if (opts.probe?.ok) return "Preview server is reachable; loading embedded view…";
  if (opts.processExited) return "The Studio preview process exited unexpectedly.";
  if (opts.probe && !opts.probe.ok) {
    return probeErrorMessage(opts.probe.errorKind, opts.probe.error);
  }
  if (!opts.studioProcessRunning) {
    return "No preview server responded on the configured port (Studio is not managing a preview process).";
  }
  if (opts.frameState === "failed" && opts.frameError) return opts.frameError;
  return "The preview server is not reachable.";
}

function probeErrorMessage(
  kind: PreviewProbeErrorKind,
  raw?: string,
): string {
  switch (kind) {
    case "econnrefused":
      return "Connection refused — the preview server is not running on localhost.";
    case "timeout":
      return "The preview server did not respond in time.";
    case "unreachable":
      return "Could not reach localhost (network error).";
    case "http_error":
      return raw ?? "Preview URL returned an error status.";
    default:
      return raw ?? "Could not connect to the preview server.";
  }
}

function PreviewServerOfflineCard({
  projectPath,
  port,
  lastSuccessfulPreviewAt,
  reason,
  probing,
  previewAction,
  setupBlocked,
  setupError,
  repairAvailable,
  onStart,
  onRestart,
  onOpenTerminal,
  onViewSetupErrors,
  onOpenDeveloperConsole,
  onRunRepair,
  canStart,
}: {
  projectPath: string | null;
  port: number;
  lastSuccessfulPreviewAt: number | null;
  reason: string;
  probing: boolean;
  previewAction: "idle" | "starting";
  setupBlocked: boolean;
  setupError: string | null;
  repairAvailable: boolean;
  onStart: () => void;
  onRestart: () => void;
  onOpenTerminal: () => void;
  onViewSetupErrors: () => void;
  onOpenDeveloperConsole: () => void;
  onRunRepair: () => void;
  canStart: boolean;
}) {
  const lastLabel =
    lastSuccessfulPreviewAt !== null
      ? new Date(lastSuccessfulPreviewAt).toLocaleString()
      : "—";

  return (
    <div className="preview-panel__offline">
      <hr className="preview-panel__offline-rule" />
      <h3 className="preview-panel__offline-title">
        {setupBlocked ? "Preview blocked by setup errors" : "Preview Server Not Running"}
      </h3>
      <p className="preview-panel__offline-lead">
        {setupBlocked
          ? "Generation finished, but npm install, TypeScript, or build must pass before preview can start."
          : "No preview server is active on localhost yet."}
      </p>
      {setupError ? (
        <p className="preview-panel__offline-setup-error" role="alert">
          {setupError}
        </p>
      ) : null}
      <p className="preview-panel__offline-reason">{reason}</p>

      <dl className="preview-panel__offline-meta">
        <div className="preview-panel__offline-row">
          <dt>Project path</dt>
          <dd className="preview-panel__mono">{projectPath ?? "—"}</dd>
        </div>
        <div className="preview-panel__offline-row">
          <dt>Port</dt>
          <dd>{port}</dd>
        </div>
        <div className="preview-panel__offline-row">
          <dt>Last successful preview</dt>
          <dd>{lastLabel}</dd>
        </div>
      </dl>

      <div className="preview-panel__offline-actions">
        {setupBlocked ? (
          <>
            <button type="button" className="prov-btn prov-btn--primary" onClick={onViewSetupErrors}>
              View setup errors
            </button>
            <button type="button" className="prov-btn" onClick={onOpenDeveloperConsole}>
              Developer console
            </button>
            {repairAvailable ? (
              <button type="button" className="prov-btn" onClick={onRunRepair}>
                Run repair
              </button>
            ) : null}
          </>
        ) : null}
        <button
          type="button"
          className="prov-btn prov-btn--primary"
          disabled={!canStart || previewAction === "starting" || probing}
          onClick={onStart}
        >
          {previewAction === "starting" ? "Starting…" : "Start Preview"}
        </button>
        <button
          type="button"
          className="prov-btn"
          disabled={!canStart || previewAction === "starting" || probing}
          onClick={onRestart}
        >
          Restart Preview
        </button>
        <button type="button" className="prov-btn" onClick={onOpenTerminal}>
          Open Terminal
        </button>
      </div>
    </div>
  );
}
