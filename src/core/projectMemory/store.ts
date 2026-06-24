import {
  EMPTY_PROJECT_MEMORY,
  type ProjectMemory,
} from "@/core/projectMemory/types";

export function normalizeProjectMemory(
  raw: Partial<ProjectMemory> | null | undefined,
  fallbackName = "",
): ProjectMemory {
  if (!raw || typeof raw !== "object") {
    return {
      ...EMPTY_PROJECT_MEMORY,
      projectName: fallbackName,
      updatedAt: Date.now(),
    };
  }
  return {
    projectName:
      typeof raw.projectName === "string" ? raw.projectName : fallbackName,
    architecture:
      typeof raw.architecture === "string" ? raw.architecture : "",
    userPreferences:
      typeof raw.userPreferences === "string" ? raw.userPreferences : "",
    notes: typeof raw.notes === "string" ? raw.notes : "",
    updatedAt:
      typeof raw.updatedAt === "number" && raw.updatedAt > 0
        ? raw.updatedAt
        : Date.now(),
  };
}

export function mergeProjectMemoryUpdate(
  current: ProjectMemory,
  patch: Partial<
    Pick<
      ProjectMemory,
      "projectName" | "architecture" | "userPreferences" | "notes"
    >
  >,
): ProjectMemory {
  return {
    projectName:
      patch.projectName !== undefined
        ? patch.projectName
        : current.projectName,
    architecture:
      patch.architecture !== undefined
        ? patch.architecture
        : current.architecture,
    userPreferences:
      patch.userPreferences !== undefined
        ? patch.userPreferences
        : current.userPreferences,
    notes: patch.notes !== undefined ? patch.notes : current.notes,
    updatedAt: Date.now(),
  };
}
