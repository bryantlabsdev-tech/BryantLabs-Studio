import { NO_PROJECT_FILES_MESSAGE } from "@/core/agent/agentReadiness";
import type { ProjectScan } from "@/types";
import type { ProjectMemory } from "@/core/projectMemory/types";
import type { SessionMemorySnapshot } from "@/core/sessionMemory/types";
import type { Confidence, Impact, Plan, PlanFile } from "@/core/planner/types";
import { tokenize } from "@/core/planner/tokenize";
import { detectIntent, type DetectedIntent } from "@/core/planner/intents";
import { applyPlannerFallback } from "@/core/planner/fallback";
import { scoreFiles } from "@/core/planner/score";
import { mergePlanRankings, rankFilesFromRepository } from "@/core/repository";

function isValidPlanFile(file: PlanFile | undefined): file is PlanFile {
  return Boolean(file?.path && file.absPath);
}

function sanitizePlanFiles(files: readonly PlanFile[]): PlanFile[] {
  return files.filter(isValidPlanFile);
}

function leadFilePath(files: readonly PlanFile[]): string | null {
  return files[0]?.path ?? null;
}

export type { Plan, PlanFile, Confidence, Impact } from "@/core/planner/types";

const MAX_FILES = 8;
const STRONG_THRESHOLD = 5;
const IMPACT_ORDER: Impact[] = ["Low", "Medium", "High"];

function deriveConfidence(
  files: PlanFile[],
  intent: DetectedIntent,
): Confidence {
  const topScore = files[0]?.score ?? 0;
  const strongCount = files.filter((f) => f.score >= STRONG_THRESHOLD).length;
  const intentRecognized = intent.rule.id !== "generic";

  if (intentRecognized && topScore >= 8 && strongCount >= 1) return "High";
  if (topScore >= STRONG_THRESHOLD || (intentRecognized && topScore >= 4)) {
    return "Medium";
  }
  return "Low";
}

function deriveImpact(base: Impact, affectedCount: number): Impact {
  let idx = IMPACT_ORDER.indexOf(base);
  if (affectedCount >= 6) idx += 1;
  else if (affectedCount <= 1) idx -= 1;
  idx = Math.max(0, Math.min(IMPACT_ORDER.length - 1, idx));
  return IMPACT_ORDER[idx]!;
}

function frameworkNote(intentId: string, scan: ProjectScan): string | null {
  const d = scan.summary.detections;
  if (intentId === "routing" || intentId === "auth") {
    if (d.nextjs) {
      return "Follow Next.js conventions — add the route under `app/` (or `pages/`).";
    }
    if (d.react) {
      return "Add a React component and register it in your router/navigation.";
    }
  }
  if (intentId === "theme" && d.viteConfig) {
    return "Global styles are loaded via the Vite entry — update them there.";
  }
  return null;
}

export function generatePlan(
  prompt: string,
  scan: ProjectScan,
  opts?: {
    projectMemory?: ProjectMemory | null;
    sessionMemory?: SessionMemorySnapshot | null;
    projectPath?: string | null;
    semanticBoostPaths?: readonly string[];
  },
): Plan {
  const trimmed = prompt.trim();
  const tokens = tokenize(trimmed);
  const intent = detectIntent(tokens, trimmed.toLowerCase());
  const intentLabel = intent.rule.label.toLowerCase();

  if (scan.files.length === 0) {
    return {
      prompt: trimmed,
      intent: intent.rule.label,
      summary: NO_PROJECT_FILES_MESSAGE,
      files: [],
      proposedChanges: [NO_PROJECT_FILES_MESSAGE],
      confidence: "Low",
      impact: "Low",
      createdAt: Date.now(),
    };
  }

  const heuristicRanked = scoreFiles(tokens, intent, scan);
  const repositoryRanked = rankFilesFromRepository(trimmed, scan, {
    projectPath: opts?.projectPath ?? null,
    projectMemory: opts?.projectMemory ?? null,
    sessionMemory: opts?.sessionMemory ?? null,
    ...(opts?.semanticBoostPaths ? { semanticBoostPaths: opts.semanticBoostPaths } : {}),
  });
  const ranked = sanitizePlanFiles(
    mergePlanRankings(heuristicRanked, repositoryRanked),
  );
  const promptLower = trimmed.toLowerCase();

  const preConfidence = deriveConfidence(ranked.slice(0, MAX_FILES), intent);
  const { files: withFallback, usedFallback } = applyPlannerFallback(
    ranked,
    scan,
    promptLower,
    preConfidence,
  );
  const files = sanitizePlanFiles(withFallback).slice(0, MAX_FILES);

  const confidence = deriveConfidence(files, intent);
  const impact = deriveImpact(intent.rule.baseImpact, files.length);
  const leadPath = leadFilePath(files);

  const proposedChanges = [...intent.rule.changeTemplates];
  const note = frameworkNote(intent.rule.id, scan);
  if (note) proposedChanges.push(note);
  if (usedFallback) {
    proposedChanges.push(
      "Using fallback file selection — start with the React entry and primary stylesheets.",
    );
  }
  if (leadPath) {
    proposedChanges.push(`Start with ${leadPath} (highest relevance).`);
  }
  if (files.length === 0) {
    proposedChanges.push(NO_PROJECT_FILES_MESSAGE);
  }

  let summary: string;
  if (files.length === 0) {
    summary = NO_PROJECT_FILES_MESSAGE;
  } else if (usedFallback) {
    summary = `Using fallback file selection. ${files.length} file${files.length === 1 ? "" : "s"} selected for this ${intentLabel} request, led by ${leadPath ?? "the project index"}. Confidence ${confidence}; estimated impact ${impact}.`;
  } else {
    summary = `This looks like a ${intentLabel} request. ${files.length} file${files.length === 1 ? "" : "s"} appear relevant, led by ${leadPath ?? "the top match"}. Confidence ${confidence}; estimated impact ${impact}.`;
  }

  return {
    prompt: trimmed,
    intent: intent.rule.label,
    summary,
    files,
    proposedChanges,
    confidence,
    impact,
    createdAt: Date.now(),
    ...(usedFallback ? { usedFallback: true } : {}),
  };
}
