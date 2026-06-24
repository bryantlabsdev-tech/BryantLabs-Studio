import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { ProjectScan } from "@/types";
import { redactMemoryText } from "@/core/memory/redact";
import type { MemoryCandidate } from "@/core/memory/types";

function uniqueFiles(files: readonly string[]): string[] {
  return [...new Set(files.map((f) => f.trim()).filter(Boolean))];
}

export function seedCandidatesFromProjectMemory(
  memory: ProjectMemory,
): MemoryCandidate[] {
  const out: MemoryCandidate[] = [];
  if (memory.architecture.trim()) {
    out.push({
      category: "project",
      title: "Architecture summary",
      content: memory.architecture.trim(),
      reason: "Imported from project memory fields",
    });
  }
  if (memory.userPreferences.trim()) {
    out.push({
      category: "user_preference",
      title: "User preferences",
      content: memory.userPreferences.trim(),
      reason: "Imported from project memory fields",
    });
  }
  if (memory.notes.trim()) {
    out.push({
      category: "project",
      title: "Project notes",
      content: memory.notes.trim(),
      reason: "Imported from project memory fields",
    });
  }
  return out;
}

export function generateMemoryCandidatesFromRun(opts: {
  snapshot: GreenfieldRunSnapshot;
  ok: boolean;
  scan: ProjectScan | null;
  prompt?: string;
  provider?: string | null;
  model?: string | null;
}): MemoryCandidate[] {
  if (!opts.ok) return [];

  const { snapshot } = opts;
  const action = snapshot.actionType;
  const files = uniqueFiles([
    ...(snapshot.workflow?.filesWritten ?? []),
    ...(snapshot.filesWritten ?? []),
  ]);
  const prompt = opts.prompt?.trim() || snapshot.workflow?.prompt?.trim() || "";
  const out: MemoryCandidate[] = [];

  if (
    action === "ai_plan" ||
    action === "apply_plan" ||
    action === "ai_patch_propose" ||
    action === "studio_agent"
  ) {
    if (prompt) {
      out.push({
        category: "success",
        title: `Successful ${action.replace(/_/g, " ")}`,
        content: redactMemoryText(
          `Goal: ${prompt.slice(0, 500)}${files.length ? `\nFiles: ${files.slice(0, 12).join(", ")}` : ""}`,
        ),
        metadata: {
          goal: prompt.slice(0, 300),
          outcome: "success",
          files,
          ...(opts.provider ? { provider: opts.provider } : {}),
          ...(opts.model ? { model: opts.model } : {}),
        },
        reason: "Successful Studio run pattern",
      });
    }
  }

  if (files.length > 0) {
    out.push({
      category: "file",
      title: "Frequently edited files",
      content: `High-success files: ${files.slice(0, 10).join(", ")}`,
      metadata: { files },
      reason: "Files modified in successful run",
    });
  }

  const repairEntries = snapshot.entries.filter((e) => e.stage === "auto_fix");
  if (repairEntries.some((e) => e.status === "success")) {
    const detail = repairEntries
      .map((e) => `${e.message}${e.details ? `: ${e.details}` : ""}`)
      .join("\n")
      .slice(0, 600);
    out.push({
      category: "repair",
      title: "Successful repair pattern",
      content: redactMemoryText(detail || "Auto-fix succeeded"),
      metadata: { outcome: "success", failureType: "repair" },
      reason: "Repair succeeded during run",
    });
  }

  if (opts.scan?.summary.framework) {
    out.push({
      category: "project",
      title: "Stack discovery",
      content: `Uses ${opts.scan.summary.framework}${opts.scan.summary.bundler ? ` + ${opts.scan.summary.bundler}` : ""}`,
      reason: "Architecture discovered from repository scan",
    });
  }

  return out.slice(0, 4);
}

export function generateRepairCandidateFromFailure(opts: {
  failureLine: string;
  fixSummary?: string;
  files?: readonly string[];
}): MemoryCandidate | null {
  const line = opts.failureLine.trim();
  if (!line) return null;
  return {
    category: "repair",
    title: line.slice(0, 80),
    content: redactMemoryText(
      [line, opts.fixSummary?.trim()].filter(Boolean).join("\nFix: "),
    ),
    metadata: {
      failureType: /typescript|tsc|type/i.test(line)
        ? "typescript"
        : /build|vite|webpack/i.test(line)
          ? "build"
          : "verification",
      ...(opts.files && opts.files.length > 0 ? { files: [...opts.files] } : {}),
    },
    reason: "Verification or repair failure pattern",
  };
}
