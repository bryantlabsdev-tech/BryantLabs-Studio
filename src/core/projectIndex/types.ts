export type ProjectIndexState = "ready" | "updating" | "stale";

export interface ProjectIndexStatus {
  readonly state: ProjectIndexState;
  readonly pendingFiles: number;
  readonly coverage: number | null;
  readonly builtAt: number | null;
  readonly fromCache: boolean;
}

export interface ProjectIndexUpdatedEvent {
  readonly changedPaths: string[];
  readonly deletedPaths: string[];
  readonly builtAt: number;
}
