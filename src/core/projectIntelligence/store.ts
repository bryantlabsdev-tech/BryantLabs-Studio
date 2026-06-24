import {
  EMPTY_PROJECT_INTELLIGENCE,
  type AgentLearning,
  type FailedFixMemory,
  type FixConfidenceRecord,
  type FixRecord,
  type ProjectIntelligence,
  type RecurringIssue,
} from "@/core/projectIntelligence/types";
import { computeFixConfidenceScore } from "@/core/projectIntelligence/confidence";
import { SESSION_RUN_HISTORY_SCOPE } from "@/core/agent/agentRunHistory";

const STORAGE_PREFIX = "bryantlabs.projectIntelligence.";

function storageKey(scope: string): string {
  return `${STORAGE_PREFIX}${scope}`;
}

export function resolveProjectIntelligenceScope(
  projectPath: string | null | undefined,
): string {
  const trimmed = projectPath?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : SESSION_RUN_HISTORY_SCOPE;
}

export function loadProjectIntelligence(
  projectPath: string | null | undefined,
): ProjectIntelligence {
  const scope = resolveProjectIntelligenceScope(projectPath);
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return normalizeProjectIntelligence(null, scope);
    return normalizeProjectIntelligence(JSON.parse(raw) as Partial<ProjectIntelligence>, scope);
  } catch {
    return normalizeProjectIntelligence(null, scope);
  }
}

export function saveProjectIntelligence(
  projectPath: string | null | undefined,
  intelligence: ProjectIntelligence,
): void {
  const scope = resolveProjectIntelligenceScope(projectPath);
  localStorage.setItem(storageKey(scope), JSON.stringify(intelligence));
}

export function normalizeProjectIntelligence(
  raw: Partial<ProjectIntelligence> | null | undefined,
  projectId: string,
  fallbackName = "",
): ProjectIntelligence {
  if (!raw || typeof raw !== "object") {
    return {
      ...EMPTY_PROJECT_INTELLIGENCE,
      projectId,
      projectName: fallbackName,
      updatedAt: Date.now(),
    };
  }
  const readIssues = (items: unknown): RecurringIssue[] => {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Partial<RecurringIssue>;
        if (!row.label?.trim()) return null;
        return {
          id: row.id?.trim() || row.label.trim(),
          label: row.label.trim(),
          occurrences: typeof row.occurrences === "number" ? row.occurrences : 1,
        };
      })
      .filter((item): item is RecurringIssue => item !== null);
  };
  const readFixes = (items: unknown): FixRecord[] => {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Partial<FixRecord>;
        if (!row.label?.trim()) return null;
        return {
          id: row.id?.trim() || row.label.trim(),
          label: row.label.trim(),
          occurrences: typeof row.occurrences === "number" ? row.occurrences : 1,
          succeeded: row.succeeded !== false,
        };
      })
      .filter((item): item is FixRecord => item !== null);
  };
  const readLearnings = (items: unknown): AgentLearning[] => {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Partial<AgentLearning>;
        if (!row.text?.trim()) return null;
        return {
          id: row.id?.trim() || `learning-${row.at ?? Date.now()}`,
          text: row.text.trim(),
          runId: row.runId ?? null,
          runNumber: row.runNumber ?? null,
          at: typeof row.at === "number" ? row.at : Date.now(),
        };
      })
      .filter((item): item is AgentLearning => item !== null);
  };
  const readConfidence = (items: unknown): FixConfidenceRecord[] => {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Partial<FixConfidenceRecord>;
        if (!row.issueId?.trim() || !row.fixLabel?.trim()) return null;
        const successes = typeof row.successes === "number" ? row.successes : 0;
        const failures = typeof row.failures === "number" ? row.failures : 0;
        return {
          issueId: row.issueId.trim(),
          fixLabel: row.fixLabel.trim(),
          successes,
          failures,
          lastUsedAt: typeof row.lastUsedAt === "number" ? row.lastUsedAt : Date.now(),
          confidenceScore:
            typeof row.confidenceScore === "number"
              ? row.confidenceScore
              : computeFixConfidenceScore(successes, failures),
        };
      })
      .filter((item): item is FixConfidenceRecord => item !== null);
  };
  const readFailedMemory = (items: unknown): FailedFixMemory[] => {
    if (!Array.isArray(items)) return [];
    return items
      .map((item) => {
        if (!item || typeof item !== "object") return null;
        const row = item as Partial<FailedFixMemory>;
        if (!row.label?.trim()) return null;
        return {
          id: row.id?.trim() || row.label.trim(),
          label: row.label.trim(),
          issueId: row.issueId ?? null,
          occurrences: typeof row.occurrences === "number" ? row.occurrences : 1,
          lastAt: typeof row.lastAt === "number" ? row.lastAt : Date.now(),
        };
      })
      .filter((item): item is FailedFixMemory => item !== null);
  };

  return {
    projectId: typeof raw.projectId === "string" ? raw.projectId : projectId,
    projectName:
      typeof raw.projectName === "string" ? raw.projectName : fallbackName,
    framework: typeof raw.framework === "string" ? raw.framework : "",
    language: typeof raw.language === "string" ? raw.language : "",
    buildSystem: typeof raw.buildSystem === "string" ? raw.buildSystem : "",
    stylingSystem: typeof raw.stylingSystem === "string" ? raw.stylingSystem : "",
    packageManager: typeof raw.packageManager === "string" ? raw.packageManager : "",
    commonFileLocations: Array.isArray(raw.commonFileLocations)
      ? raw.commonFileLocations.filter((v): v is string => typeof v === "string")
      : [],
    detectedArchitecture:
      typeof raw.detectedArchitecture === "string" ? raw.detectedArchitecture : "",
    recurringUiPatterns: Array.isArray(raw.recurringUiPatterns)
      ? raw.recurringUiPatterns.filter((v): v is string => typeof v === "string")
      : [],
    recurringAuditIssues: readIssues(raw.recurringAuditIssues),
    successfulFixes: readFixes(raw.successfulFixes),
    failedFixes: readFixes(raw.failedFixes),
    fixConfidence: readConfidence(raw.fixConfidence),
    failedFixMemory: readFailedMemory(raw.failedFixMemory),
    recentLearnings: readLearnings(raw.recentLearnings),
    updatedAt:
      typeof raw.updatedAt === "number" && raw.updatedAt > 0
        ? raw.updatedAt
        : Date.now(),
  };
}
