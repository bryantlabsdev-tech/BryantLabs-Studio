import {
  applyDeterministicRepairs,
  type ProjectRepairResult,
} from "@/core/greenfield/deterministicProjectRepairs";
import { createFilesystemProjectRepairIo } from "@/core/greenfield/projectRepairIo";
import { parseTypeScriptDiagnostics } from "@/core/greenfield/tscDiagnostics";
import type { StressRepairAttempt } from "./types";

export type { ProjectRepairResult };

export async function applyDeterministicRepairsOnProject(
  root: string,
  maxPasses?: number,
): Promise<ProjectRepairResult> {
  const io = createFilesystemProjectRepairIo(root);
  return applyDeterministicRepairs(io, maxPasses);
}

export function parseDiagnosticsFromOutput(stdout: string, stderr: string) {
  return parseTypeScriptDiagnostics(stdout, stderr);
}

/** @deprecated Use {@link ProjectRepairResult} from core. */
export type { StressRepairAttempt };
