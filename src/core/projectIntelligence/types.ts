export interface RecurringIssue {
  readonly id: string;
  readonly label: string;
  readonly occurrences: number;
}

export interface FixRecord {
  readonly id: string;
  readonly label: string;
  readonly occurrences: number;
  readonly succeeded: boolean;
}

export interface FixConfidenceRecord {
  readonly issueId: string;
  readonly fixLabel: string;
  readonly successes: number;
  readonly failures: number;
  readonly lastUsedAt: number;
  readonly confidenceScore: number;
}

export interface FailedFixMemory {
  readonly id: string;
  readonly label: string;
  readonly issueId: string | null;
  readonly occurrences: number;
  readonly lastAt: number;
}

export interface MemoryRecommendation {
  readonly issueId: string;
  readonly issueLabel: string;
  readonly occurrences: number;
  readonly recommendedFix: string;
  readonly confidenceScore: number;
}

export interface AgentLearning {
  readonly id: string;
  readonly text: string;
  readonly runId: string | null;
  readonly runNumber: number | null;
  readonly at: number;
}

export interface ProjectMemoryInjectionMeta {
  readonly injected: boolean;
  readonly contextSize: number;
  readonly recommendationUsed: boolean;
}

/** Persisted project intelligence — stack, patterns, issues, fixes, learnings. */
export interface ProjectIntelligence {
  readonly projectId: string;
  readonly projectName: string;
  readonly framework: string;
  readonly language: string;
  readonly buildSystem: string;
  readonly stylingSystem: string;
  readonly packageManager: string;
  readonly commonFileLocations: readonly string[];
  readonly detectedArchitecture: string;
  readonly recurringUiPatterns: readonly string[];
  readonly recurringAuditIssues: readonly RecurringIssue[];
  readonly successfulFixes: readonly FixRecord[];
  readonly failedFixes: readonly FixRecord[];
  readonly fixConfidence: readonly FixConfidenceRecord[];
  readonly failedFixMemory: readonly FailedFixMemory[];
  readonly recentLearnings: readonly AgentLearning[];
  readonly updatedAt: number;
}

export const EMPTY_PROJECT_INTELLIGENCE: ProjectIntelligence = {
  projectId: "",
  projectName: "",
  framework: "",
  language: "",
  buildSystem: "",
  stylingSystem: "",
  packageManager: "",
  commonFileLocations: [],
  detectedArchitecture: "",
  recurringUiPatterns: [],
  recurringAuditIssues: [],
  successfulFixes: [],
  failedFixes: [],
  fixConfidence: [],
  failedFixMemory: [],
  recentLearnings: [],
  updatedAt: 0,
};
