import { useMemo, useState } from "react";
import type { CommandResult, VerificationResult } from "@/types";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { EmptyState } from "@/components/EmptyState";
import { deriveVerificationProblems } from "@/core/diagnostics/verificationProblems";

/**
 * Bottom dock "Verification" tab (Phase 6). Runs `npx tsc --noEmit` and
 * `npm run build` in the open project and renders their status, diagnostics,
 * timing, and raw output. Read-only: no auto-fix, no AI.
 */
export function VerificationView() {
  const {
    project,
    verification,
    verifyStatus,
    verifyError,
    lastEditedPath,
    runVerification,
  } = useWorkspace();

  const [copyNote, setCopyNote] = useState<string | null>(null);
  const running = verifyStatus === "running";
  const problems = useMemo(
    () => deriveVerificationProblems(verification),
    [verification],
  );

  if (!project) {
    return (
      <div className="verify__empty">
        <EmptyState
          title="No project open"
          description="Open a project to run build and type-check verification."
        />
      </div>
    );
  }

  const copyReport = async () => {
    if (!verification) return;
    try {
      await navigator.clipboard.writeText(formatDockVerificationReport(verification));
      setCopyNote("Copied");
    } catch {
      setCopyNote("Copy failed");
    }
    window.setTimeout(() => setCopyNote(null), 2000);
  };

  return (
    <div className="verify">
      <div className="verify__bar">
        <button
          type="button"
          className="verify__run"
          onClick={() => void runVerification()}
          disabled={running}
        >
          {running ? "Verifying…" : "Run Verification"}
        </button>
        {verification ? (
          <button
            type="button"
            className="prov-btn"
            onClick={() => void copyReport()}
          >
            Copy verification report
          </button>
        ) : null}
        {copyNote ? <span className="verify__copynote">{copyNote}</span> : null}
        <span className="verify__assoc">
          {lastEditedPath ? (
            <>
              for last edit: <code>{lastEditedPath}</code>
            </>
          ) : (
            "Runs tsc --noEmit and npm run build"
          )}
        </span>
        {verification ? (
          <span className="verify__ranat">
            Last run {new Date(verification.ranAt).toLocaleTimeString()}
          </span>
        ) : null}
      </div>

      {verifyStatus === "error" ? (
        <p className="verify__error">{verifyError ?? "Verification failed."}</p>
      ) : null}

      {problems.length > 0 ? (
        <div className="verify__problems" role="list" aria-label="Problems">
          <h3 className="verify__problems-title">Problems ({problems.length})</h3>
          <ul className="verify__problems-list">
            {problems.map((problem, index) => (
              <li key={`${problem.source}-${index}`} className="verify__problem">
                <span className="verify__problem-source">{problem.source}</span>
                {problem.file ? (
                  <code className="verify__problem-file">
                    {problem.file}
                    {problem.line != null ? `:${problem.line}` : ""}
                  </code>
                ) : null}
                <span className="verify__problem-message">{problem.message}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {running ? (
        <p className="verify__hint">
          Running type-check, then build. This can take a moment…
        </p>
      ) : verification ? (
        <div className="verify__results">
          <CommandCard label="TypeScript" result={verification.typecheck} />
          <CommandCard label="Build" result={verification.build} />
        </div>
      ) : verifyStatus !== "error" ? (
        <p className="verify__hint">
          No verification has run yet. Apply an edit, then run verification to
          confirm the project still type-checks and builds.
        </p>
      ) : null}
    </div>
  );
}

function statusLabel(result: CommandResult): { text: string; tone: string } {
  if (result.timedOut) return { text: "Timed out", tone: "fail" };
  if (result.ok) return { text: "Passed", tone: "pass" };
  return { text: "Failed", tone: "fail" };
}

function formatDockVerificationReport(result: VerificationResult): string {
  const formatCmd = (label: string, cmd: CommandResult) => {
    const files = new Set<string>();
    const combined = `${cmd.stdout}\n${cmd.stderr}`;
    const re = /^(.+?)\(\d+,\d+\):/gm;
    let m: RegExpExecArray | null;
    while ((m = re.exec(combined)) !== null) files.add(m[1]!.trim());
    return [
      `=== ${label} ===`,
      `Command: ${cmd.command}`,
      `Exit: ${cmd.exitCode ?? "—"}`,
      `Errors counted: ${cmd.errorCount}`,
      `Files: ${files.size ? [...files].join(", ") : "(none parsed)"}`,
      "",
      "--- stdout ---",
      cmd.stdout || "(empty)",
      "",
      "--- stderr ---",
      cmd.stderr || "(empty)",
    ].join("\n");
  };
  return [
    "Project verification report",
    `Ran at: ${new Date(result.ranAt).toISOString()}`,
    "",
    formatCmd("TypeScript", result.typecheck),
    "",
    formatCmd("Build", result.build),
  ].join("\n");
}

function CommandCard({
  label,
  result,
}: {
  label: string;
  result: CommandResult;
}) {
  const status = statusLabel(result);
  const seconds = (result.durationMs / 1000).toFixed(1);
  const output = [result.stdout, result.stderr].filter(Boolean).join("\n");

  return (
    <section className={`verify-card verify-card--${status.tone}`}>
      <header className="verify-card__head">
        <span className="verify-card__title">{label}</span>
        <span className={`verify-badge verify-badge--${status.tone}`}>
          {status.text}
        </span>
        <span className="verify-card__meta">
          exit {result.exitCode ?? "—"} · {seconds}s
        </span>
      </header>

      <div className="verify-card__counts">
        <span className="verify-count verify-count--error">
          {result.errorCount} error{result.errorCount === 1 ? "" : "s"}
        </span>
        <span className="verify-count verify-count--warn">
          {result.warningCount} warning{result.warningCount === 1 ? "" : "s"}
        </span>
        <span className="verify-card__cmd">{result.command}</span>
      </div>

      {output ? (
        <details className="verify-output" open={!result.ok}>
          <summary>Output</summary>
          <pre className="verify-output__pre">
            {output}
            {result.truncated ? "\n…[output truncated]" : ""}
          </pre>
        </details>
      ) : (
        <p className="verify-card__noout">No output captured.</p>
      )}
    </section>
  );
}
