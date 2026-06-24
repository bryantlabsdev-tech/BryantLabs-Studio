export type SemanticIndexMode = "tfidf" | "ollama";

export interface SemanticChunk {
  readonly id: string;
  readonly path: string;
  readonly startLine: number;
  readonly endLine: number;
  readonly text: string;
  readonly symbolName: string | null;
}

export interface SemanticIndexSnapshot {
  readonly version: 1;
  readonly projectPath: string;
  readonly builtAt: number;
  readonly mode: SemanticIndexMode;
  readonly chunkCount: number;
  readonly fileCount: number;
}

export interface SemanticSearchHit {
  readonly path: string;
  readonly score: number;
  readonly reason: string;
  readonly chunkId: string;
  readonly preview: string;
  readonly symbolName: string | null;
}

export interface SemanticIndexStatus {
  readonly ready: boolean;
  readonly building: boolean;
  readonly mode: SemanticIndexMode | null;
  readonly chunkCount: number;
  readonly fileCount: number;
  readonly builtAt: number | null;
  readonly lastError: string | null;
}
