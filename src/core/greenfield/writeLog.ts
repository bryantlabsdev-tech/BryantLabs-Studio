/** Per-file write log entry returned from the greenfield write IPC handler. */
export interface WriteFileLogEntry {
  readonly path: string;
  readonly mkdir: "created" | "exists" | "failed" | "skipped";
  readonly mkdirDetail?: string;
  readonly overwrite: boolean;
  readonly ok: boolean;
  readonly reason?: string;
}

export type FileWriteMode = "safe" | "workspace";

export const FILE_WRITE_MODE_DEFAULT: FileWriteMode = "workspace";

export function formatWriteFileLogMessage(entry: WriteFileLogEntry): string {
  if (entry.ok) {
    const action = entry.overwrite ? "Overwrote" : "Wrote";
    return `${action} ${entry.path}`;
  }
  return `Failed ${entry.path}`;
}

export function formatWriteFileLogDetails(entry: WriteFileLogEntry): string {
  const parts: string[] = [`path: ${entry.path}`];
  if (entry.mkdir === "created") {
    parts.push("directory: created");
  } else if (entry.mkdir === "exists") {
    parts.push("directory: exists");
  } else if (entry.mkdir === "failed") {
    parts.push(`directory: failed${entry.mkdirDetail ? ` (${entry.mkdirDetail})` : ""}`);
  }
  if (entry.overwrite) parts.push("overwrite: yes");
  if (entry.reason) parts.push(`reason: ${entry.reason}`);
  return parts.join(" · ");
}

export function formatWriteLogsSummary(logs: readonly WriteFileLogEntry[]): string {
  return logs.map((e) => formatWriteFileLogDetails(e)).join("\n");
}

export interface WriteFileLogSink {
  appendRunLog: (
    status: "success" | "failed",
    message: string,
    details?: string,
  ) => void;
  emitConsole: (input: {
    stage: "write:success" | "write:fail";
    message: string;
    details?: string;
    error?: string;
  }) => void;
}

/** Emit per-file write logs to run log and console. */
export function emitWriteFileLogs(
  logs: readonly WriteFileLogEntry[] | undefined,
  sink: WriteFileLogSink,
): void {
  if (!logs?.length) return;
  for (const entry of logs) {
    const message = formatWriteFileLogMessage(entry);
    const details = formatWriteFileLogDetails(entry);
    const errorText = entry.reason ?? details;
    if (entry.ok) {
      sink.appendRunLog("success", message, details);
      sink.emitConsole({ stage: "write:success", message, details });
    } else {
      sink.appendRunLog("failed", message, errorText);
      sink.emitConsole({
        stage: "write:fail",
        message,
        details: errorText,
        error: entry.reason ?? errorText,
      });
    }
  }
}
