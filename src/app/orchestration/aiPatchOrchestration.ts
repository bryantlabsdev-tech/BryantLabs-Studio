import { buildAgentApplyPlanContext } from "@/core/context/buildAgentContext";
import { formatInlineEditPrompt, type InlineEditSelection } from "@/core/editor/inlineEdit";
import { isEditablePath, validatePatch } from "@/core/editor";
import { diffLineStats } from "@/core/planApply";
import {
  estimateAiCalls,
  normalizeProviderSettings,
  resolveStageRouting,
} from "@/core/providers/orchestration";
import { activeProviderModel } from "@/core/studioRun/types";
import { MAX_AI_PATCH_CHARS } from "@/app/orchestration/applyPlan";
import type { AIPatchOrchestrationHost } from "@/app/orchestration/aiPatchTypes";

function relPathForActiveFile(
  host: AIPatchOrchestrationHost,
): { abs: string; rel: string } | null {
  const { project, activeFile } = host;
  if (!project || !activeFile) return null;
  const abs = activeFile.node.path;
  const rel = abs.startsWith(project.path)
    ? abs.slice(project.path.length).replace(/^[/\\]+/, "")
    : activeFile.node.name;
  return { abs, rel };
}

export async function proposeAIPatchOrchestration(
  host: AIPatchOrchestrationHost | null,
  prompt: string,
  opts?: { readonly selection?: InlineEditSelection },
): Promise<void> {
  if (!host?.api || !host.project || !host.activeFile || !host.activeFile.result.readable) {
    return;
  }
  const effectivePrompt =
    opts?.selection != null
      ? formatInlineEditPrompt(prompt, opts.selection)
      : prompt;
  if (effectivePrompt.trim() === "") return;

  const content = host.activeFile.result.content;
  if (content.length > MAX_AI_PATCH_CHARS) {
    host.setPatchStatus("error");
    host.setPatchError(
      `This file is too large for an AI patch proposal (over ${Math.round(
        MAX_AI_PATCH_CHARS / 1000,
      )}k characters).`,
    );
    return;
  }

  const paths = relPathForActiveFile(host);
  if (!paths) return;
  const { abs, rel } = paths;

  const symbols = (host.scan?.symbols ?? [])
    .filter((s) => s.absPath === abs)
    .map((s) => ({ name: s.name, kind: s.kind }));
  const memoryRetrieval = host.scan
    ? host.resolveMemoriesForPrompt(effectivePrompt, "ai_patch", [rel])
    : null;
  const context = host.scan
    ? buildAgentApplyPlanContext(host.scan, {
        userPrompt: effectivePrompt,
        projectMemory: host.projectMemoryRef.current,
        sessionMemory: host.sessionMemory,
        projectPath: host.project.path,
        memoryRetrieval,
      })
    : {
        framework: "unknown",
        language: "unknown",
        packageManager: "unknown",
        totalFiles: 0,
        totalFolders: 0,
        entryPoints: [],
        files: [],
        symbols: [],
      };

  host.setPatchStatus("running");
  host.setAiPatchSession(null);
  host.setPatchError(null);
  host.setAiPatchApproved(false);
  host.setAiPatchApplyStatus("idle");
  host.setAiPatchApplyError(null);
  host.beginStudioAction("ai_patch_propose", "ai_patch_propose", "AI Patch proposal started", {
    details: `${rel}: ${prompt.slice(0, 120)}${prompt.length > 120 ? "…" : ""}`,
    patch: {
      workflow: { prompt, patchTarget: rel },
    },
  });

  try {
    const settings = normalizeProviderSettings(
      await host.api.getProviderSettings(),
    );
    const routing = resolveStageRouting(settings, "coder");
    const estimatedCalls = estimateAiCalls(settings, "ai_patch");
    host.updateGreenfieldRun({
      provider: routing?.provider ?? settings.provider,
      model: routing?.model ?? activeProviderModel(settings),
    });
    host.appendGreenfieldRunLog(
      "ai_patch_propose",
      "running",
      `Estimated AI calls: ${estimatedCalls}`,
    );
    if (host.scan) {
      host.commitContextCapture({
        operation: "ai_patch",
        provider: routing?.provider ?? settings.provider,
        model: routing?.model ?? activeProviderModel(settings),
        originalPrompt: effectivePrompt,
        planContext: context,
        settings,
        estimatedAiCalls: estimatedCalls,
      });
    }
    const result = await host.invokeCoderCall(settings, 4096, (provider) =>
      host.api!.proposePatch(
        provider,
        effectivePrompt,
        context,
        { path: rel, content },
        symbols,
      ),
    );
    if (!result) {
      host.setPatchStatus("error");
      host.setPatchError("AI Patch stopped — provider budget exceeded or run cancelled.");
      host.finishStudioAction(
        "ai_patch_propose",
        "ai_patch_propose",
        false,
        "AI Patch stopped",
        {
          details: "Provider budget exceeded or run cancelled",
          patch: { workflow: { prompt, patchTarget: rel, errors: ["Stopped"] } },
        },
      );
      return;
    }
    host.setPatchStatus(result.ok ? "done" : "error");
    if (result.ok && result.proposal) {
      const stats = diffLineStats(content, result.proposal.newContent);
      host.setAiPatchSession({
        patch: result,
        basisContent: content,
        absPath: abs,
        relPath: rel,
        proposedAt: Date.now(),
      });
      host.finishStudioAction(
        "ai_patch_propose",
        "ai_patch_propose",
        true,
        "AI Patch proposed",
        {
          details: `${rel} · +${stats.added} / −${stats.removed} lines`,
          patch: {
            workflow: {
              prompt,
              patchTarget: rel,
              filesProposed: 1,
              linesAdded: stats.added,
              linesRemoved: stats.removed,
            },
          },
        },
      );
    } else {
      host.setAiPatchSession(null);
      const err = result.error ?? "The provider did not return a patch.";
      host.setPatchError(err);
      host.finishStudioAction(
        "ai_patch_propose",
        "ai_patch_propose",
        false,
        "AI Patch proposal failed",
        {
          details: err,
          patch: {
            workflow: {
              prompt,
              patchTarget: rel,
              errors: [err],
            },
          },
        },
      );
    }
  } catch {
    host.setPatchStatus("error");
    host.setPatchError("Patch proposal failed to run.");
    host.finishStudioAction(
      "ai_patch_propose",
      "ai_patch_propose",
      false,
      "AI Patch proposal failed",
      {
        details: "Provider request threw",
        patch: {
          workflow: {
            prompt,
            patchTarget: rel,
            errors: ["Patch proposal failed to run."],
          },
        },
      },
    );
  }
}

export function approveAIPatchOrchestration(
  host: AIPatchOrchestrationHost | null,
): void {
  if (!host?.aiPatchSession?.patch.ok || !host.aiPatchSession.patch.proposal) {
    return;
  }
  const { basisContent, patch } = host.aiPatchSession;
  const after = patch.proposal!.newContent;
  if (after === basisContent) {
    host.setPatchError("There is no diff to approve — the proposal matches the file.");
    return;
  }
  const pathCheck = isEditablePath(host.aiPatchSession.relPath);
  if (!pathCheck.ok) {
    host.setPatchError(pathCheck.reason ?? "This path cannot be edited.");
    return;
  }
  const validation = validatePatch(basisContent, after);
  if (!validation.ok) {
    host.setPatchError(validation.reason ?? "Invalid patch.");
    return;
  }
  host.setAiPatchApproved(true);
  host.setPatchError(null);
}

export function discardAIPatchApprovalOrchestration(
  host: AIPatchOrchestrationHost | null,
): void {
  if (!host) return;
  host.setAiPatchApproved(false);
  host.setAiPatchApplyStatus("idle");
  host.setAiPatchApplyError(null);
}

export function rejectAIPatchOrchestration(
  host: AIPatchOrchestrationHost | null,
): void {
  if (!host) return;
  host.setAiPatchSession(null);
  host.setAiPatchApproved(false);
  host.setAiPatchApplyStatus("idle");
  host.setAiPatchApplyError(null);
  host.setPatchStatus("idle");
  host.setPatchError(null);
}

export async function applyAIPatchOrchestration(
  host: AIPatchOrchestrationHost | null,
): Promise<void> {
  if (!host?.api || !host.aiPatchSession || !host.aiPatchApproved) return;

  const { patch, basisContent, absPath, relPath } = host.aiPatchSession;
  const proposal = patch.proposal;
  if (!patch.ok || !proposal) return;

  const pathCheck = isEditablePath(relPath);
  if (!pathCheck.ok) {
    host.setAiPatchApplyStatus("error");
    host.setAiPatchApplyError(pathCheck.reason ?? "This path cannot be edited.");
    return;
  }
  const validation = validatePatch(basisContent, proposal.newContent);
  if (!validation.ok) {
    host.setAiPatchApplyStatus("error");
    host.setAiPatchApplyError(validation.reason ?? "Invalid patch.");
    return;
  }

  host.setAiPatchApplyStatus("applying");
  host.setAiPatchApplyError(null);
  const stats = diffLineStats(basisContent, proposal.newContent);
  host.beginStudioAction("ai_patch_apply", "ai_patch_apply", "AI Patch apply started", {
    details: relPath,
    patch: { workflow: { patchTarget: relPath } },
  });

  try {
    const res = await host.api.applyEdit(
      absPath,
      basisContent,
      proposal.newContent,
    );
    if (res.ok) {
      host.setAiPatchApplyStatus("applied");
      host.setCanUndo(true);
      host.setLastEditedPath(relPath);
      host.setAiPatchApproved(false);
      await host.openPath(absPath);
      void host.runScan();
      host.finishStudioAction("ai_patch_apply", "ai_patch_apply", true, "AI Patch applied", {
        details: relPath,
        patch: {
          filesWritten: [relPath],
          workflow: {
            patchTarget: relPath,
            filesWritten: [relPath],
            filesAccepted: 1,
            linesAdded: stats.added,
            linesRemoved: stats.removed,
          },
        },
      });
    } else {
      host.setAiPatchApplyStatus("error");
      const reason = res.reason ?? "Failed to apply the AI patch.";
      host.setAiPatchApplyError(reason);
      host.finishStudioAction("ai_patch_apply", "ai_patch_apply", false, "AI Patch apply failed", {
        details: reason,
        patch: {
          workflow: { patchTarget: relPath, errors: [reason] },
        },
      });
    }
  } catch {
    host.setAiPatchApplyStatus("error");
    host.setAiPatchApplyError("Failed to apply the AI patch.");
    host.finishStudioAction("ai_patch_apply", "ai_patch_apply", false, "AI Patch apply failed", {
      details: "Apply threw",
      patch: {
        workflow: {
          patchTarget: relPath,
          errors: ["Failed to apply the AI patch."],
        },
      },
    });
  }
}
