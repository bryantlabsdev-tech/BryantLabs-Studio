import type { ProviderId } from "@/core/providers/types";
import type { PlanContext } from "@/core/planner/aiTypes";
import type { PlanPatchMeta } from "@/core/planner/aiTypes";
import {
  patchUsesSearchReplace,
  applySearchReplaceBlocks,
} from "@/core/patch/searchReplace";
import { validateProposalQuality } from "@/core/planApply/proposalValidation";
import { isEditablePath } from "@/core/editor/validate";
import type { ProjectScan, ReadFileResult } from "@/types";
import type { EditResult } from "@/types";
import { validateCrossFileBatch } from "@/core/execution/crossFileValidation";
import { orderFilesInStep } from "@/core/execution/dependencyOrder";
import { refreshSessionDiagnostics } from "@/core/execution/diagnostics";
import type {
  ExecutionFileEntry,
  ExecutionSession,
  ExecutionStep,
} from "@/core/execution/types";
import type { AIPatchResult } from "@/core/planner/aiTypes";

const MAX_PATCH_CHARS = 60_000;

export interface ExecutionStepCallbacks {
  readFile(absPath: string): Promise<ReadFileResult>;
  proposePatch(
    provider: ProviderId,
    prompt: string,
    context: PlanContext,
    target: { path: string; content: string },
    symbols: { name: string; kind: string }[],
    meta: PlanPatchMeta,
  ): Promise<AIPatchResult>;
  applyEdit(
    absPath: string,
    before: string,
    after: string,
  ): Promise<EditResult>;
  createFile(absPath: string, content: string): Promise<EditResult>;
}

export interface StepRunResult {
  session: ExecutionSession;
  ok: boolean;
  error?: string;
}

function updateFile(
  session: ExecutionSession,
  relPath: string,
  patch: Partial<ExecutionFileEntry>,
): ExecutionSession {
  const files = session.files.map((f) =>
    f.relPath === relPath ? { ...f, ...patch } : f,
  );
  return { ...session, files, diagnostics: refreshSessionDiagnostics({ ...session, files }) };
}

function updateStep(
  session: ExecutionSession,
  stepId: string,
  patch: Partial<ExecutionStep>,
): ExecutionSession {
  const steps = session.steps.map((s) =>
    s.id === stepId ? { ...s, ...patch } : s,
  );
  return { ...session, steps, diagnostics: refreshSessionDiagnostics({ ...session, steps }) };
}

/** Propose, validate, apply all files in one execution step. */
export async function runExecutionStep(
  session: ExecutionSession,
  step: ExecutionStep,
  scan: ProjectScan,
  provider: ProviderId,
  context: PlanContext,
  callbacks: ExecutionStepCallbacks,
): Promise<StepRunResult> {
  let current = updateStep(session, step.id, { status: "running" });
  current = { ...current, currentStepId: step.id, phase: "running" };

  const isNew = (rel: string) =>
    current.files.find((f) => f.relPath === rel)?.isNewFile ?? false;

  const ordered = orderFilesInStep(step.filePaths, scan, isNew);
  const stepFiles = ordered
    .map((rel) => current.files.find((f) => f.relPath === rel))
    .filter((f): f is ExecutionFileEntry => f !== undefined);

  for (const entry of stepFiles) {
    if (entry.status === "applied" || entry.status === "verified") continue;

    const pathCheck = isEditablePath(entry.relPath);
    if (!pathCheck.ok) {
      current = updateFile(current, entry.relPath, {
        status: "skipped",
        ...(pathCheck.reason ? { error: pathCheck.reason } : {}),
      });
      continue;
    }

    current = updateFile(current, entry.relPath, { status: "proposing" });

    let basis = "";
    if (!entry.isNewFile) {
      const read = await callbacks.readFile(entry.absPath);
      if (!read.readable || read.content === undefined) {
        current = updateFile(current, entry.relPath, {
          status: "error",
          error: read.reason ?? "Could not read file.",
        });
        return failStep(current, step.id, `Could not read ${entry.relPath}`);
      }
      basis = read.content;
      if (basis.length > MAX_PATCH_CHARS) {
        current = updateFile(current, entry.relPath, {
          status: "error",
          error: "File too large for patch proposal.",
        });
        return failStep(current, step.id, `${entry.relPath} exceeds size limit`);
      }
    }

    const symbols = scan.symbols
      .filter((s) => s.absPath === entry.absPath)
      .map((s) => ({ name: s.name, kind: s.kind }));

    let patchResult: AIPatchResult;
    try {
      patchResult = await callbacks.proposePatch(
        provider,
        current.prompt,
        context,
        { path: entry.relPath, content: basis },
        symbols,
        { planSummary: current.planSummary, fileReason: entry.planReason },
      );
    } catch {
      current = updateFile(current, entry.relPath, {
        status: "error",
        error: "Patch proposal failed.",
      });
      return failStep(current, step.id, `Proposal failed for ${entry.relPath}`);
    }

    if (!patchResult.ok || !patchResult.proposal) {
      current = updateFile(current, entry.relPath, {
        status: "error",
        patch: patchResult,
        error: patchResult.error ?? "No proposal returned.",
      });
      return failStep(current, step.id, patchResult.error ?? "Proposal failed");
    }

    let proposedContent = patchResult.proposal.newContent;
    if (patchUsesSearchReplace(proposedContent)) {
      const sr = applySearchReplaceBlocks(basis, proposedContent);
      if (!sr.ok || !sr.content) {
        current = updateFile(current, entry.relPath, {
          status: "error",
          error: sr.error ?? "Search/replace patch failed.",
        });
        return failStep(current, step.id, sr.error ?? "Search/replace patch failed.");
      }
      proposedContent = sr.content;
    }

    const quality = validateProposalQuality(
      basis,
      proposedContent,
      entry.relPath,
    );
    if (!quality.ok) {
      current = updateFile(current, entry.relPath, {
        status: "error",
        basisContent: basis,
        proposal: patchResult.proposal,
        patch: patchResult,
        rejectionReason: quality.reason,
        error: quality.reason,
      });
      return failStep(current, step.id, quality.reason);
    }

    current = updateFile(current, entry.relPath, {
      status: "proposed",
      basisContent: basis,
      proposal: { ...patchResult.proposal, newContent: proposedContent },
      patch: patchResult,
    });
  }

  const batch = stepFiles.map(
    (f) => current.files.find((x) => x.relPath === f.relPath)!,
  );
  const cross = validateCrossFileBatch(batch, scan);
  if (!cross.ok) {
    for (const issue of cross.issues) {
      current = updateFile(current, issue.file, {
        crossFileOk: false,
        crossFileIssues: [
          ...(current.files.find((f) => f.relPath === issue.file)?.crossFileIssues ??
            []),
          issue.message,
        ],
      });
    }
    return failStep(
      current,
      step.id,
      cross.issues[0]?.message ?? "Cross-file validation failed",
    );
  }

  for (const entry of stepFiles) {
    const file = current.files.find((f) => f.relPath === entry.relPath);
    if (!file?.proposal) continue;

    current = updateFile(current, entry.relPath, { status: "approved" });

    let writeOk: EditResult;
    if (file.isNewFile) {
      writeOk = await callbacks.createFile(
        file.absPath,
        file.proposal.newContent,
      );
    } else {
      writeOk = await callbacks.applyEdit(
        file.absPath,
        file.basisContent ?? "",
        file.proposal.newContent,
      );
    }

    if (!writeOk.ok) {
      current = updateFile(current, entry.relPath, {
        status: "error",
        error: writeOk.reason ?? "Apply failed",
      });
      return failStep(current, step.id, writeOk.reason ?? "Apply failed");
    }

    current = updateFile(current, entry.relPath, { status: "applied" });
  }

  current = updateStep(current, step.id, { status: "completed" });
  current = {
    ...current,
    currentStepId: null,
    diagnostics: refreshSessionDiagnostics(current),
  };
  return { session: current, ok: true };
}

function failStep(
  session: ExecutionSession,
  stepId: string,
  error: string,
): StepRunResult {
  const steps = session.steps.map((s) =>
    s.id === stepId ? { ...s, status: "failed" as const, error } : s,
  );
  const next: ExecutionSession = {
    ...session,
    steps,
    phase: "paused",
    pausedAtStepId: stepId,
    applyError: error,
    diagnostics: refreshSessionDiagnostics({ ...session, steps }),
  };
  return { session: next, ok: false, error };
}
