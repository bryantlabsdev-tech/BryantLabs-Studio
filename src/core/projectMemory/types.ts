/** Persisted project memory (Phase 19) — local notes and preferences. */
export interface ProjectMemory {
  readonly projectName: string;
  readonly architecture: string;
  readonly userPreferences: string;
  readonly notes: string;
  readonly updatedAt: number;
}

export const EMPTY_PROJECT_MEMORY: ProjectMemory = {
  projectName: "",
  architecture: "",
  userPreferences: "",
  notes: "",
  updatedAt: 0,
};
