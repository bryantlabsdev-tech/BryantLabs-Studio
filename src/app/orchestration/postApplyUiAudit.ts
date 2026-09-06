import type { BryantLabsApi } from "@/types";
import type { VerificationResult } from "@/types";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { RunLogStage } from "@/core/greenfield/runLog";
import {
  buildAdvisoryUiAuditResult,
  buildSkippedUiAuditResult,
  buildTransportErrorResult,
  classifyUiLayout,
  evaluateUiAuditFromSources,
  GENERATED_APP_UI_AUDIT_LABEL,
  validateGeneratedAppPreviewAuditUrl,
  type UiAuditResult,
} from "@/core/greenfield/uiAudit";

export type GreenfieldRunUpdate = Partial<GreenfieldRunSnapshot>;

export interface PostApplyUiAuditHost {
  readonly api: BryantLabsApi;
  readonly appendGreenfieldRunLog: (
    stage: RunLogStage,
    status: "running" | "success" | "failed",
    message: string,
    details?: string,
  ) => void;
  readonly updateGreenfieldRun: (patch: GreenfieldRunUpdate) => void;
}

export interface PostApplyUiAuditResult {
  readonly ok: true;
  readonly advisory: boolean;
  readonly cancelled: boolean;
  readonly audit: UiAuditResult | null;
}

type ActiveAudit = {
  readonly projectPath: string;
  readonly controller: AbortController;
};

const activeAudits = new Map<string, ActiveAudit>();

function auditKey(projectPath: string, previewUrl: string): string {
  return `${projectPath}::${previewUrl}`;
}

/** Cancel every in-flight post-apply UI audit (project switch / quit). */
export function cancelAllPostApplyUiAudits(reason = "project closed"): void {
  for (const [key, entry] of activeAudits) {
    entry.controller.abort(reason);
    activeAudits.delete(key);
  }
}

/** Cancel audits for one project root. */
export function cancelPostApplyUiAuditsForProject(
  projectPath: string,
  reason = "project closed",
): void {
  const normalized = projectPath.replace(/\/$/, "");
  for (const [key, entry] of activeAudits) {
    if (entry.projectPath.replace(/\/$/, "") !== normalized) continue;
    entry.controller.abort(reason);
    activeAudits.delete(key);
  }
}

export function getActivePostApplyUiAuditCount(): number {
  return activeAudits.size;
}

/**
 * After a verified apply, strip patches that would reverse success.
 * UI audit may only attach advisory diagnostics / history.
 */
export function sanitizePostApplyUiAuditPatch(
  prev: GreenfieldRunSnapshot,
  patch: Partial<GreenfieldRunSnapshot>,
): Partial<GreenfieldRunSnapshot> {
  const next: Partial<GreenfieldRunSnapshot> = { ...patch };

  // Never demote a completed successful apply.
  if (prev.runResult === "success") {
    if (next.runResult === "failed" || next.runResult === "running") {
      delete next.runResult;
    }
    if ("finalMessage" in next) delete next.finalMessage;
    if ("latestAction" in next) delete next.latestAction;
    if ("endedAt" in next) delete next.endedAt;
    if ("durationMs" in next) delete next.durationMs;
    if ("failureReport" in next) delete next.failureReport;
  }

  if (next.uiAuditResult && !next.uiAuditResult.ok && !next.uiAuditResult.skipped) {
    next.uiAuditResult = buildAdvisoryUiAuditResult(next.uiAuditResult);
  }

  return next;
}

async function readProjectFile(
  api: BryantLabsApi,
  folderPath: string,
  relPath: string,
): Promise<string | null> {
  try {
    const abs = `${folderPath.replace(/\/$/, "")}/${relPath}`;
    const res = await api.readFile(abs);
    return res.readable && res.content !== undefined ? res.content : null;
  } catch {
    return null;
  }
}

/**
 * Advisory-only UI audit after a verified apply.
 * Never repairs files, never flips runResult to failed, respects abort.
 */
export async function runPostApplyUiAuditAdvisory(
  host: PostApplyUiAuditHost,
  opts: {
    readonly folderPath: string;
    readonly previewUrl: string;
    readonly userPrompt: string;
    readonly verification: VerificationResult;
    readonly signal?: AbortSignal;
  },
): Promise<PostApplyUiAuditResult> {
  const signal = opts.signal;
  const cancelled = (): boolean => Boolean(signal?.aborted);

  const safeUpdate = (patch: Partial<GreenfieldRunSnapshot>) => {
    if (cancelled()) return;
    // Never reverse a completed apply — only attach advisory audit fields.
    const next: Partial<GreenfieldRunSnapshot> = { ...patch };
    delete next.runResult;
    delete next.finalMessage;
    delete next.latestAction;
    delete next.endedAt;
    delete next.durationMs;
    delete next.failureReport;
    if (next.uiAuditResult && !next.uiAuditResult.ok && !next.uiAuditResult.skipped) {
      next.uiAuditResult = buildAdvisoryUiAuditResult(next.uiAuditResult);
    }
    host.updateGreenfieldRun(next);
  };

  const safeLog = (
    status: "running" | "success" | "failed",
    message: string,
    details?: string,
  ) => {
    if (cancelled()) return;
    // Never emit a hard ui_audit failure after a verified apply — advisory only.
    const normalizedStatus = status === "failed" ? "success" : status;
    const normalizedMessage =
      status === "failed"
        ? `${GENERATED_APP_UI_AUDIT_LABEL} advisory`
        : message;
    host.appendGreenfieldRunLog(
      "ui_audit",
      normalizedStatus,
      normalizedMessage,
      details ?? (status === "failed" ? message : undefined),
    );
  };

  if (!opts.verification.typecheck.ok || !opts.verification.build.ok) {
    return { ok: true, advisory: false, cancelled: false, audit: null };
  }

  const urlCheck = validateGeneratedAppPreviewAuditUrl(opts.previewUrl);
  if (!urlCheck.ok || !urlCheck.normalizedUrl) {
    const skipped = buildSkippedUiAuditResult(
      urlCheck.reason ?? "No preview URL available.",
    );
    safeLog("success", `${GENERATED_APP_UI_AUDIT_LABEL} skipped`, skipped.details);
    safeUpdate({ uiAuditResult: skipped });
    return { ok: true, advisory: true, cancelled: cancelled(), audit: skipped };
  }

  if (cancelled()) {
    return { ok: true, advisory: false, cancelled: true, audit: null };
  }

  safeLog("running", `${GENERATED_APP_UI_AUDIT_LABEL} started`, urlCheck.normalizedUrl);

  const appSource = await readProjectFile(host.api, opts.folderPath, "src/App.tsx");
  const cssSource = await readProjectFile(host.api, opts.folderPath, "src/index.css");
  if (cancelled()) {
    return { ok: true, advisory: false, cancelled: true, audit: null };
  }

  let audit: UiAuditResult;
  try {
    const classification = classifyUiLayout(opts.userPrompt, appSource, cssSource);
    const transport = await host.api.greenfieldUiAudit(urlCheck.normalizedUrl);
    if (cancelled()) {
      return { ok: true, advisory: false, cancelled: true, audit: null };
    }
    if (!transport.ok || !transport.snapshot) {
      audit = buildTransportErrorResult(
        transport.error ?? "Could not inspect generated app preview DOM.",
        classification,
      );
    } else {
      audit = evaluateUiAuditFromSources(
        opts.userPrompt,
        appSource,
        cssSource,
        transport.snapshot,
      );
    }
  } catch (err) {
    if (cancelled()) {
      return { ok: true, advisory: false, cancelled: true, audit: null };
    }
    const classification = classifyUiLayout(opts.userPrompt, appSource, cssSource);
    audit = buildTransportErrorResult(
      err instanceof Error ? err.message : "UI audit failed unexpectedly.",
      classification,
    );
  }

  if (audit.ok) {
    safeLog(
      "success",
      `${GENERATED_APP_UI_AUDIT_LABEL} passed · ${audit.type}`,
      `score=${audit.score}`,
    );
    safeUpdate({ uiAuditResult: audit });
    return { ok: true, advisory: false, cancelled: false, audit };
  }

  const advisory = buildAdvisoryUiAuditResult(audit);
  safeLog(
    "success",
    `${GENERATED_APP_UI_AUDIT_LABEL} advisory`,
    advisory.details,
  );
  safeUpdate({ uiAuditResult: advisory });
  return { ok: true, advisory: true, cancelled: false, audit: advisory };
}

/** Schedule advisory UI audit without blocking apply completion. */
export function schedulePostApplyUiAudit(
  host: PostApplyUiAuditHost,
  opts: {
    readonly folderPath: string;
    readonly previewUrl: string;
    readonly userPrompt: string;
    readonly verification: VerificationResult;
  },
): { readonly promise: Promise<PostApplyUiAuditResult>; readonly cancel: () => void } {
  cancelPostApplyUiAuditsForProject(opts.folderPath, "superseded");
  const controller = new AbortController();
  const key = auditKey(opts.folderPath, opts.previewUrl);
  activeAudits.set(key, { projectPath: opts.folderPath, controller });

  const promise = runPostApplyUiAuditAdvisory(host, {
    ...opts,
    signal: controller.signal,
  })
    .catch((err): PostApplyUiAuditResult => {
      if (!controller.signal.aborted) {
        host.appendGreenfieldRunLog(
          "ui_audit",
          "success",
          `${GENERATED_APP_UI_AUDIT_LABEL} advisory`,
          err instanceof Error
            ? err.message
            : "UI audit could not finish after a successful apply; edits were kept.",
        );
      }
      return { ok: true, advisory: true, cancelled: controller.signal.aborted, audit: null };
    })
    .finally(() => {
      const current = activeAudits.get(key);
      if (current?.controller === controller) activeAudits.delete(key);
    });

  return {
    promise,
    cancel: () => {
      controller.abort("cancelled");
      activeAudits.delete(key);
    },
  };
}
