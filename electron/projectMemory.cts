import * as path from "node:path";
import { promises as fs } from "node:fs";
import { writeBryantlabsJson } from "./safeFs.cjs";
import { isActiveProjectRoot } from "./projectWriteCoordinator.cjs";

const MEMORY_FILE = "project-memory.json";

export interface ProjectMemoryRecord {
  projectName: string;
  architecture: string;
  userPreferences: string;
  notes: string;
  updatedAt: number;
}

function memoryPath(projectRoot: string): string {
  return path.join(projectRoot, ".bryantlabs", MEMORY_FILE);
}

export async function readProjectMemory(
  projectRoot: string,
  fallbackName: string,
): Promise<ProjectMemoryRecord> {
  const file = memoryPath(projectRoot);
  try {
    const raw = await fs.readFile(file, "utf8");
    const data = JSON.parse(raw) as Partial<ProjectMemoryRecord>;
    return {
      projectName:
        typeof data.projectName === "string" && data.projectName.length > 0
          ? data.projectName
          : fallbackName,
      architecture:
        typeof data.architecture === "string" ? data.architecture : "",
      userPreferences:
        typeof data.userPreferences === "string" ? data.userPreferences : "",
      notes: typeof data.notes === "string" ? data.notes : "",
      updatedAt:
        typeof data.updatedAt === "number" && data.updatedAt > 0
          ? data.updatedAt
          : Date.now(),
    };
  } catch {
    return {
      projectName: fallbackName,
      architecture: "",
      userPreferences: "",
      notes: "",
      updatedAt: 0,
    };
  }
}

export async function writeProjectMemory(
  projectRoot: string,
  memory: ProjectMemoryRecord,
): Promise<{ ok: boolean; reason?: string }> {
  if (!isActiveProjectRoot(projectRoot)) {
    return { ok: false, reason: "Project is no longer active." };
  }
  const payload: ProjectMemoryRecord = {
    ...memory,
    updatedAt: Date.now(),
  };
  return writeBryantlabsJson(projectRoot, MEMORY_FILE, payload, "filesystem");
}
