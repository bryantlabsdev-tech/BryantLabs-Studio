export const AGENT_COPY = {
  boot: "I'm looking through the project…",
  review: {
    ready: "The changes are ready whenever you want to review them.",
    open: "Review changes",
  },
  failure: {
    default: "I couldn't safely apply this edit.",
    patch: "the generated patch wasn't valid",
    build: "the build failed after applying changes",
    cancelled: "Run cancelled.",
  },
  tools: {
    readProject: "Reading project structure",
    explore: (count: number) => `Explored ${count} files`,
    exploreGeneric: "Explored codebase",
    plan: "Planned changes",
    generate: "Generating implementation",
    edit: (file: string) => `Editing ${file}`,
    edited: (file: string) => `Edited ${file}`,
    editedMany: (count: number) => `Edited ${count} files`,
    typescript: "Running TypeScript",
    typescriptDone: "TypeScript check passed",
    build: "Running build",
    buildDone: "Build passed",
    preview: "Launching preview",
    previewDone: "Preview started",
    repair: "Repairing errors",
  },
} as const;

/** Tiered wait copy — deterministic by elapsed time, never repeats within a tier. */
export function pickWaitObservation(elapsedMs: number): string {
  if (elapsedMs < 10_000) return "I'm reviewing the project.";
  if (elapsedMs < 20_000) return "I'm tracing how this feature is connected.";
  if (elapsedMs < 40_000) return "I'm making sure this change doesn't affect other parts of the app.";
  if (elapsedMs < 60_000) {
    return "This is a larger change than usual, so I'm taking a little more time.";
  }
  if (elapsedMs < 90_000) return "I'm still generating the implementation.";
  return "This is taking longer than expected, but the provider is still working.";
}

export function formatToolElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
