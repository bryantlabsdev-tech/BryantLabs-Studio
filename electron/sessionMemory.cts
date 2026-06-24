import * as path from "node:path";
import { promises as fs } from "node:fs";
import { writeBryantlabsJson } from "./safeFs.cjs";
import { isActiveProjectRoot } from "./projectWriteCoordinator.cjs";

const MEMORY_FILE = "session-memory.json";

export interface SessionPromptRecord {
  prompt: string;
  at: number;
}

export interface SessionPlanRecord {
  source: "deterministic" | "ai";
  prompt: string;
  summary: string;
  files: string[];
  at: number;
}

export interface SessionFailureRecord {
  summary: string;
  at: number;
}

export interface SessionAutoFixRecord {
  summary: string;
  files: string[];
  at: number;
}

export interface SessionProviderRecord {
  provider: string;
  model: string;
  operation: string;
  at: number;
}

export interface SessionRunSummary {
  prompt: string;
  ok: boolean;
  filesModified: string[];
  provider: string | null;
  model: string | null;
  durationMs: number;
  summary: string;
  at: number;
}

export interface SessionMemoryRecord {
  version: 1;
  projectPath: string;
  branch: string | null;
  lastPrompt: string | null;
  prompts: SessionPromptRecord[];
  plans: SessionPlanRecord[];
  lastDeterministicPlan: SessionPlanRecord | null;
  lastAiPlan: SessionPlanRecord | null;
  modifiedFiles: string[];
  failures: SessionFailureRecord[];
  autoFixes: SessionAutoFixRecord[];
  providerHistory: SessionProviderRecord[];
  runSummaries: SessionRunSummary[];
  updatedAt: number;
}

function memoryPath(projectRoot: string): string {
  return path.join(projectRoot, ".bryantlabs", MEMORY_FILE);
}

function emptyRecord(projectPath: string, branch: string | null): SessionMemoryRecord {
  return {
    version: 1,
    projectPath,
    branch,
    lastPrompt: null,
    prompts: [],
    plans: [],
    lastDeterministicPlan: null,
    lastAiPlan: null,
    modifiedFiles: [],
    failures: [],
    autoFixes: [],
    providerHistory: [],
    runSummaries: [],
    updatedAt: Date.now(),
  };
}

function cap<T>(list: T[], max: number): T[] {
  return list.length <= max ? list : list.slice(list.length - max);
}

export function normalizeSessionMemoryRecord(
  raw: unknown,
  projectPath: string,
  branch: string | null,
): SessionMemoryRecord {
  const base = emptyRecord(projectPath, branch);
  if (!raw || typeof raw !== "object") return base;
  const data = raw as Partial<SessionMemoryRecord>;
  return {
    version: 1,
    projectPath,
    branch,
    lastPrompt: typeof data.lastPrompt === "string" ? data.lastPrompt : null,
    prompts: cap(Array.isArray(data.prompts) ? data.prompts : [], 20),
    plans: cap(Array.isArray(data.plans) ? data.plans : [], 12),
    lastDeterministicPlan:
      data.lastDeterministicPlan && typeof data.lastDeterministicPlan === "object"
        ? (data.lastDeterministicPlan as SessionPlanRecord)
        : null,
    lastAiPlan:
      data.lastAiPlan && typeof data.lastAiPlan === "object"
        ? (data.lastAiPlan as SessionPlanRecord)
        : null,
    modifiedFiles: cap(Array.isArray(data.modifiedFiles) ? data.modifiedFiles : [], 24),
    failures: cap(Array.isArray(data.failures) ? data.failures : [], 10),
    autoFixes: cap(Array.isArray(data.autoFixes) ? data.autoFixes : [], 10),
    providerHistory: cap(Array.isArray(data.providerHistory) ? data.providerHistory : [], 30),
    runSummaries: cap(Array.isArray(data.runSummaries) ? data.runSummaries : [], 20),
    updatedAt:
      typeof data.updatedAt === "number" && data.updatedAt > 0 ? data.updatedAt : Date.now(),
  };
}

export async function readSessionMemory(
  projectRoot: string,
  branch: string | null,
): Promise<SessionMemoryRecord> {
  const file = memoryPath(projectRoot);
  try {
    const raw = await fs.readFile(file, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return normalizeSessionMemoryRecord(parsed, projectRoot, branch);
  } catch {
    return emptyRecord(projectRoot, branch);
  }
}

export async function writeSessionMemory(
  projectRoot: string,
  memory: SessionMemoryRecord,
): Promise<{ ok: boolean; reason?: string }> {
  if (!isActiveProjectRoot(projectRoot)) {
    return { ok: false, reason: "Project is no longer active." };
  }
  const payload: SessionMemoryRecord = {
    ...memory,
    version: 1,
    projectPath: projectRoot,
    updatedAt: Date.now(),
  };
  return writeBryantlabsJson(projectRoot, MEMORY_FILE, payload, "filesystem");
}
