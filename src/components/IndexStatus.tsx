import { useWorkspace } from "@/app/WorkspaceProvider";

/**
 * Compact indicator of incremental project index state.
 */
export function IndexStatus() {
  const { scan, scanStatus, projectIndexStatus } = useWorkspace();

  let tone: "idle" | "ok" | "busy" | "error" | "stale" = "idle";
  let label = "Not indexed";

  const indexState = projectIndexStatus?.state;

  if (scanStatus === "error" || indexState === "stale") {
    tone = indexState === "stale" ? "stale" : "error";
    label =
      indexState === "stale"
        ? "Index stale — rescan recommended"
        : "Index failed";
  } else if (scanStatus === "scanning" || indexState === "updating") {
    tone = "busy";
    const pending = projectIndexStatus?.pendingFiles ?? 0;
    label =
      pending > 0
        ? `Updating · ${pending} file${pending === 1 ? "" : "s"}`
        : "Updating index…";
  } else if ((scanStatus === "done" && scan) || indexState === "ready") {
    tone = "ok";
    const files = scan?.index.length ?? 0;
    const symbols = scan?.symbols.length ?? 0;
    const cacheHint = projectIndexStatus?.fromCache ? " · warm cache" : "";
    label = `Ready · ${files} files · ${symbols} symbols${cacheHint}`;
  }

  return (
    <div className={`index-status index-status--${tone}`}>
      <span className="index-status__dot" aria-hidden="true" />
      <span className="index-status__label">{label}</span>
    </div>
  );
}
