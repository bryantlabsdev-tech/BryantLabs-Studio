import {
  appendUiAuditHistory,
  buildAdvisoryUiAuditResult,
  buildSkippedUiAuditResult,
  buildTransportErrorResult,
  buildUiRepairPatches,
  classifyUiLayout,
  createUiAuditHistoryEntry,
  evaluateUiAuditFromSources,
  GENERATED_APP_UI_AUDIT_LABEL,
  logRunComplete,
  logUiAuditResult,
  logUiAuditSkipped,
  logUiAuditStart,
  logUiRepairPatchApplied,
  logUiRepairPatchGenerated,
  logUiRepairStart,
  validateGeneratedAppPreviewAuditUrl,
  type UiAuditHistoryEntry,
  type UiAuditResult,
} from "@/core/greenfield/uiAudit";
import { createLatestAction } from "@/core/greenfield/runLog";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { GreenfieldSetupResult } from "@/core/greenfield/types";
import type { BryantLabsApi } from "@/types";

export interface GreenfieldUiRepairHost {
  readonly api: BryantLabsApi;
  readonly appendGreenfieldRunLog: (
    stage: "ui_audit" | "ui_repair" | "typescript" | "build" | "preview",
    status: "running" | "success" | "failed",
    message: string,
    details?: string,
  ) => void;
  readonly updateGreenfieldRun: (patch: Partial<GreenfieldRunSnapshot>) => void;
  readonly setAppPreview: (state: {
    url: string | null;
    running: boolean;
    root: string;
    lastSuccessfulPreviewAt?: number | null;
    port?: number | null;
  }) => void;
  readonly requestPreviewTab: () => void;
}

export interface GreenfieldUiAuditAndRepairInput {
  readonly folderPath: string;
  readonly previewUrl: string;
  readonly setup: GreenfieldSetupResult;
  readonly userPrompt?: string;
  readonly uiAuditHistory?: readonly UiAuditHistoryEntry[];
}

export interface GreenfieldUiAuditAndRepairResult {
  readonly ok: boolean;
  readonly audit: UiAuditResult;
  readonly repaired: boolean;
  readonly finalMessage: string;
  readonly uiAuditHistory: readonly UiAuditHistoryEntry[];
}

async function readProjectFile(
  api: BryantLabsApi,
  projectRoot: string,
  relPath: string,
): Promise<string | null> {
  const abs = `${projectRoot.replace(/\/$/, "")}/${relPath}`;
  try {
    const res = await api.readFile(abs);
    return res.readable && res.content !== undefined ? res.content : null;
  } catch {
    return null;
  }
}

async function runTypecheck(
  api: BryantLabsApi,
  root: string,
  previous: GreenfieldSetupResult,
): Promise<GreenfieldSetupResult> {
  const res = await api.greenfieldTypecheck(root);
  if ("error" in res) {
    return { ...previous, ok: false, error: res.error };
  }
  return {
    ...previous,
    typecheck: res.typecheck,
    ok: res.typecheck.ok && (previous.build?.ok ?? true),
    ...(!res.typecheck.ok
      ? { error: "TypeScript check failed after UI repair." }
      : {}),
  };
}

async function runBuild(
  api: BryantLabsApi,
  root: string,
  previous: GreenfieldSetupResult,
): Promise<GreenfieldSetupResult> {
  const res = await api.greenfieldBuild(root);
  if ("error" in res) {
    return { ...previous, ok: false, error: res.error };
  }
  return {
    ...previous,
    build: res.build,
    ok: res.build.ok,
    ...(!res.build.ok ? { error: "Build failed after UI repair." } : {}),
  };
}

async function restartPreview(
  host: GreenfieldUiRepairHost,
  folderPath: string,
): Promise<{ ok: boolean; url?: string; error?: string }> {
  host.appendGreenfieldRunLog("preview", "running", "Preview restarted after UI repair");
  const preview = await host.api.greenfieldPreviewStart(folderPath);
  if (preview.ok && preview.url) {
    host.appendGreenfieldRunLog("preview", "success", "Preview restarted", preview.url);
    host.setAppPreview({
      url: preview.url,
      running: true,
      root: folderPath,
      lastSuccessfulPreviewAt: Date.now(),
      port: (() => {
        try {
          const p = new URL(preview.url).port;
          return p ? Number(p) : 4173;
        } catch {
          return 4173;
        }
      })(),
    });
    host.requestPreviewTab();
    return { ok: true, url: preview.url };
  }
  const err = preview.error ?? preview.diagnostics?.rootCause ?? "Preview failed after UI repair.";
  host.appendGreenfieldRunLog("preview", "failed", "Preview failed after UI repair", err);
  return { ok: false, error: err };
}

function recordAudit(
  history: readonly UiAuditHistoryEntry[],
  audit: UiAuditResult,
  opts?: { repaired?: boolean; strategy?: string },
): readonly UiAuditHistoryEntry[] {
  return appendUiAuditHistory(history, createUiAuditHistoryEntry(audit, opts));
}

function corePipelinePassed(setup: GreenfieldSetupResult): boolean {
  return (
    setup.ok &&
    setup.typecheck?.ok !== false &&
    (setup.build?.ok ?? false)
  );
}

function advisorySuccessMessage(audit: UiAuditResult, repaired: boolean): string {
  const advisory = audit.skipReason?.trim() || audit.details?.trim() || "layout checks did not fully pass.";
  if (repaired) {
    return `Success — TypeScript passed, build passed, preview passed. ${GENERATED_APP_UI_AUDIT_LABEL} advisory after repair: ${advisory}`;
  }
  return `Success — TypeScript passed, build passed, preview passed. ${GENERATED_APP_UI_AUDIT_LABEL} advisory: ${advisory}`;
}

function successMessage(audit: UiAuditResult, repaired: boolean): string {
  const base =
    `Success — TypeScript passed, build passed, preview passed, ${GENERATED_APP_UI_AUDIT_LABEL} passed.`;
  if (!repaired) return base;
  return `${base} (repaired via ${audit.strategy ?? "deterministic"} ${audit.type})`;
}

function finishAdvisoryUiAudit(
  host: GreenfieldUiRepairHost,
  audit: UiAuditResult,
  history: readonly UiAuditHistoryEntry[],
  setup: GreenfieldSetupResult,
  repaired: boolean,
): GreenfieldUiAuditAndRepairResult {
  const advisory = buildAdvisoryUiAuditResult(audit);
  host.appendGreenfieldRunLog(
    "ui_audit",
    "success",
    `${GENERATED_APP_UI_AUDIT_LABEL} advisory`,
    advisory.details,
  );
  host.updateGreenfieldRun({
    uiAuditResult: advisory,
    uiAuditHistory: history,
    setupResult: setup,
  });
  const msg = advisorySuccessMessage(advisory, repaired);
  logRunComplete(true);
  return {
    ok: true,
    audit: advisory,
    repaired,
    finalMessage: msg,
    uiAuditHistory: history,
  };
}

async function runUiAudit(
  api: BryantLabsApi,
  previewUrl: string,
  appSource: string | null,
  cssSource: string | null,
  userPrompt: string,
): Promise<UiAuditResult> {
  logUiAuditStart(GENERATED_APP_UI_AUDIT_LABEL);
  const classification = classifyUiLayout(userPrompt, appSource, cssSource);
  const transport = await api.greenfieldUiAudit(previewUrl);

  if (!transport.ok || !transport.snapshot) {
    const result = buildTransportErrorResult(
      transport.error ?? "Could not inspect generated app preview DOM.",
      classification,
    );
    logUiAuditResult(result);
    return result;
  }

  const result = evaluateUiAuditFromSources(
    userPrompt,
    appSource,
    cssSource,
    transport.snapshot,
  );
  logUiAuditResult(result);
  return result;
}

async function applyDeterministicUiRepair(
  host: GreenfieldUiRepairHost,
  folderPath: string,
  audit: UiAuditResult,
  appSource: string,
  cssSource: string | null,
): Promise<{ ok: boolean; paths: string[]; strategy: string; error?: string }> {
  const { strategy, patches } = buildUiRepairPatches(audit.type, appSource, cssSource);
  if (patches.length === 0) {
    return {
      ok: false,
      paths: [],
      strategy,
      error: `No deterministic repair patches for ${audit.type}.`,
    };
  }

  logUiRepairStart(strategy);
  host.appendGreenfieldRunLog("ui_repair", "running", "Deterministic UI repair started", strategy);
  logUiRepairPatchGenerated(patches.map((p) => p.relPath));

  const applied: string[] = [];
  for (const patch of patches) {
    const previous = await readProjectFile(host.api, folderPath, patch.relPath);
    if (previous == null) continue;
    const abs = `${folderPath.replace(/\/$/, "")}/${patch.relPath}`;
    const edit = await host.api.applyEdit(abs, previous, patch.content);
    if (!edit.ok) {
      return {
        ok: false,
        paths: applied,
        strategy,
        error: edit.reason ?? `Failed to apply UI repair to ${patch.relPath}`,
      };
    }
    applied.push(patch.relPath);
  }

  logUiRepairPatchApplied(applied);
  host.appendGreenfieldRunLog(
    "ui_repair",
    "success",
    "Deterministic UI repair applied",
    `${strategy} · ${applied.join(", ")}`,
  );
  return { ok: true, paths: applied, strategy };
}

export async function runGreenfieldUiAuditAndRepair(
  host: GreenfieldUiRepairHost,
  input: GreenfieldUiAuditAndRepairInput,
): Promise<GreenfieldUiAuditAndRepairResult> {
  const { folderPath, previewUrl, setup, userPrompt = "" } = input;
  let history: readonly UiAuditHistoryEntry[] = [...(input.uiAuditHistory ?? [])];

  const urlCheck = validateGeneratedAppPreviewAuditUrl(previewUrl);
  if (!urlCheck.ok) {
    const reason = urlCheck.reason ?? "No preview URL available.";
    logUiAuditSkipped(reason);
    const skipped = buildSkippedUiAuditResult(reason);
    history = recordAudit(history, skipped);
    host.appendGreenfieldRunLog(
      "ui_audit",
      "success",
      `${GENERATED_APP_UI_AUDIT_LABEL} skipped`,
      reason,
    );
    host.updateGreenfieldRun({ uiAuditResult: skipped, uiAuditHistory: history });
    const msg = `Success — TypeScript passed, build passed, preview passed. ${GENERATED_APP_UI_AUDIT_LABEL} skipped: ${reason}`;
    logRunComplete(true);
    return {
      ok: true,
      audit: skipped,
      repaired: false,
      finalMessage: msg,
      uiAuditHistory: history,
    };
  }

  const appSource = await readProjectFile(host.api, folderPath, "src/App.tsx");
  const cssSource = await readProjectFile(host.api, folderPath, "src/index.css");
  const auditedPreviewUrl = urlCheck.normalizedUrl!;

  host.appendGreenfieldRunLog(
    "ui_audit",
    "running",
    `${GENERATED_APP_UI_AUDIT_LABEL} started`,
    auditedPreviewUrl,
  );
  let audit = await runUiAudit(
    host.api,
    auditedPreviewUrl,
    appSource,
    cssSource,
    userPrompt,
  );
  history = recordAudit(history, audit);

  if (audit.ok) {
    host.appendGreenfieldRunLog(
      "ui_audit",
      "success",
      `${GENERATED_APP_UI_AUDIT_LABEL} passed · ${audit.type}`,
      `score=${audit.score}`,
    );
    const msg = successMessage(audit, false);
    host.updateGreenfieldRun({ uiAuditResult: audit, uiAuditHistory: history });
    logRunComplete(true);
    return { ok: true, audit, repaired: false, finalMessage: msg, uiAuditHistory: history };
  }

  host.appendGreenfieldRunLog(
    "ui_audit",
    "failed",
    `${GENERATED_APP_UI_AUDIT_LABEL} found issues · ${audit.type}`,
    `score=${audit.score} · issues=${audit.issues.join(",")}`,
  );

  if (!appSource) {
    if (corePipelinePassed(setup)) {
      return finishAdvisoryUiAudit(host, audit, history, setup, false);
    }
    const msg = "UI audit failed and App.tsx is not readable.";
    host.updateGreenfieldRun({ uiAuditResult: audit, uiAuditHistory: history });
    logRunComplete(false);
    return { ok: false, audit, repaired: false, finalMessage: msg, uiAuditHistory: history };
  }

  const repair = await applyDeterministicUiRepair(
    host,
    folderPath,
    audit,
    appSource,
    cssSource,
  );
  if (!repair.ok) {
    if (corePipelinePassed(setup)) {
      return finishAdvisoryUiAudit(host, audit, history, setup, false);
    }
    const msg = repair.error ?? "Deterministic UI repair failed.";
    host.appendGreenfieldRunLog("ui_repair", "failed", "UI repair failed", msg);
    host.updateGreenfieldRun({ uiAuditResult: audit, uiAuditHistory: history });
    logRunComplete(false);
    return { ok: false, audit, repaired: false, finalMessage: msg, uiAuditHistory: history };
  }

  host.appendGreenfieldRunLog("typescript", "running", "TypeScript check after UI repair");
  let nextSetup = await runTypecheck(host.api, folderPath, setup);
  if (!nextSetup.typecheck?.ok) {
    const msg = "UI repair applied but TypeScript check failed.";
    host.appendGreenfieldRunLog("typescript", "failed", "TypeScript failed after UI repair");
    host.updateGreenfieldRun({ uiAuditResult: audit, uiAuditHistory: history });
    logRunComplete(false);
    return { ok: false, audit, repaired: true, finalMessage: msg, uiAuditHistory: history };
  }
  host.appendGreenfieldRunLog("typescript", "success", "TypeScript passed after UI repair");

  host.appendGreenfieldRunLog("build", "running", "Build after UI repair");
  nextSetup = await runBuild(host.api, folderPath, nextSetup);
  if (!nextSetup.build?.ok) {
    const msg = "UI repair applied but build failed.";
    host.appendGreenfieldRunLog("build", "failed", "Build failed after UI repair");
    host.updateGreenfieldRun({ uiAuditResult: audit, uiAuditHistory: history });
    logRunComplete(false);
    return { ok: false, audit, repaired: true, finalMessage: msg, uiAuditHistory: history };
  }
  host.appendGreenfieldRunLog("build", "success", "Build passed after UI repair");

  const preview = await restartPreview(host, folderPath);
  if (!preview.ok || !preview.url) {
    const msg = preview.error ?? "Preview failed after UI repair.";
    host.updateGreenfieldRun({ uiAuditResult: audit, uiAuditHistory: history });
    logRunComplete(false);
    return { ok: false, audit, repaired: true, finalMessage: msg, uiAuditHistory: history };
  }

  host.appendGreenfieldRunLog(
    "ui_audit",
    "running",
    `${GENERATED_APP_UI_AUDIT_LABEL} verification after repair`,
  );
  audit = await runUiAudit(host.api, preview.url, appSource, cssSource, userPrompt);
  audit = { ...audit, strategy: repair.strategy };
  history = recordAudit(history, audit, {
    repaired: true,
    strategy: repair.strategy,
  });

  if (!audit.ok) {
    if (corePipelinePassed(nextSetup)) {
      return finishAdvisoryUiAudit(host, audit, history, nextSetup, true);
    }
    host.appendGreenfieldRunLog(
      "ui_audit",
      "failed",
      `${GENERATED_APP_UI_AUDIT_LABEL} verification failed`,
      `score=${audit.score} · issues=${audit.issues.join(",")}`,
    );
    const msg = `UI repair applied but verification failed: ${audit.details}`;
    host.updateGreenfieldRun({
      uiAuditResult: audit,
      uiAuditHistory: history,
      setupResult: nextSetup,
    });
    logRunComplete(false);
    return { ok: false, audit, repaired: true, finalMessage: msg, uiAuditHistory: history };
  }

  host.appendGreenfieldRunLog(
    "ui_audit",
    "success",
    `${GENERATED_APP_UI_AUDIT_LABEL} passed after repair`,
    `score=${audit.score} · strategy=${repair.strategy}`,
  );
  host.updateGreenfieldRun({
    uiAuditResult: audit,
    uiAuditHistory: history,
    setupResult: nextSetup,
  });
  const msg = successMessage(audit, true);
  logRunComplete(true);
  return { ok: true, audit, repaired: true, finalMessage: msg, uiAuditHistory: history };
}

export function markGreenfieldUiAuditFailure(
  audit: UiAuditResult,
  updateGreenfieldRun: (patch: Partial<GreenfieldRunSnapshot>) => void,
  history?: readonly UiAuditHistoryEntry[],
  runStartedAt?: number | null,
): void {
  const endedAt = Date.now();
  const durationMs =
    runStartedAt != null ? Math.max(0, endedAt - runStartedAt) : null;
  updateGreenfieldRun({
    runResult: "failed",
    endedAt,
    durationMs,
    uiAuditResult: audit,
    ...(history !== undefined ? { uiAuditHistory: history } : {}),
    finalMessage: `${audit.auditLabel ?? GENERATED_APP_UI_AUDIT_LABEL} failed: ${audit.details}`,
    latestAction: createLatestAction("failed", "UI audit failed", {
      stage: "ui_audit",
      detail: audit.details,
    }),
  });
}

/** Complete greenfield successfully when build/preview passed but UI audit only has advisory issues. */
export function markGreenfieldUiAuditAdvisorySuccess(
  audit: UiAuditResult,
  updateGreenfieldRun: (patch: Partial<GreenfieldRunSnapshot>) => void,
  history: readonly UiAuditHistoryEntry[],
  runStartedAt: number | null | undefined,
  repaired: boolean,
): void {
  const endedAt = Date.now();
  const durationMs =
    runStartedAt != null ? Math.max(0, endedAt - runStartedAt) : null;
  const advisoryAudit = buildAdvisoryUiAuditResult(audit);
  const advisory =
    advisoryAudit.skipReason?.trim() || "Minor layout checks did not fully pass.";
  const finalMessage = repaired
    ? `App is ready (${GENERATED_APP_UI_AUDIT_LABEL} advisory after repair): ${advisory}`
    : `App is ready (${GENERATED_APP_UI_AUDIT_LABEL} advisory): ${advisory}`;
  updateGreenfieldRun({
    runResult: "success",
    endedAt,
    durationMs,
    lastSuccessfulRunAt: endedAt,
    uiAuditResult: advisoryAudit,
    uiAuditHistory: history,
    finalMessage,
    latestAction: createLatestAction("success", "Greenfield complete (UI audit advisory)", {
      stage: "ui_audit",
      detail: finalMessage,
    }),
  });
}
