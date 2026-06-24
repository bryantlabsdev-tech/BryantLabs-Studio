import type { AIPlanAttemptRecord, AIPlanResult } from "@/core/planner/aiTypes";
import {
  AI_PLAN_EXPECTED_SCHEMA,
  AI_PLAN_REQUIRED_ROOT_KEYS,
  aiPlanFailureTitle,
} from "@/core/planner/aiPlanSchema";
import { useWorkspace } from "@/app/WorkspaceProvider";

function basename(p: string): string {
  const n = p.replace(/^\.\//, "").replace(/\\/g, "/");
  return n.split("/").pop() ?? n;
}

function attemptLabel(index: number, total: number, attempt: AIPlanAttemptRecord): string {
  const reason = attempt.parseFailReason ?? "failed";
  if (total <= 1) return `Previous attempt (${reason})`;
  return `Attempt ${index + 1} (${reason})`;
}

/**
 * Renders an AI-generated plan (Phase 7.5). Plan only — summary, files,
 * reasoning, risks, confidence. No edits or generation are performed.
 */
export function AIPlanView({ result }: { result: AIPlanResult }) {
  const { scan, openPath, runAIPlan, aiPlanStatus } = useWorkspace();

  if (!result.ok || !result.plan) {
    const title = aiPlanFailureTitle(result.parseFailReason, result.error);
    const truncated = result.parseFailReason === "truncated";
    const schemaFailed = result.parseFailReason === "schema_validation";
    const invalidJson = result.parseFailReason === "json_syntax";
    const noJson = result.parseFailReason === "no_json";
    const history =
      result.attemptHistory ??
      (result.priorAttempt ? [result.priorAttempt] : []);

    return (
      <div className="aiplan aiplan--error">
        <section
          className={`aiplan__fail-banner${
            truncated
              ? " aiplan__fail-banner--truncated"
              : schemaFailed
                ? " aiplan__fail-banner--schema"
                : invalidJson
                  ? " aiplan__fail-banner--syntax"
                  : noJson
                    ? " aiplan__fail-banner--nojson"
                    : ""
          }`}
        >
          <h3 className="aiplan__fail-banner-title">{title}</h3>
          {truncated ? (
            <>
              <p className="aiplan__fail-banner-lead">
                The AI stopped before completing a valid JSON object.
              </p>
              <p className="aiplan__truncated-sub">Likely causes:</p>
              <ul className="aiplan__truncated-causes">
                <li>output cutoff</li>
                <li>timeout</li>
                <li>provider interruption</li>
              </ul>
            </>
          ) : null}
          {schemaFailed ? (
            <p className="aiplan__fail-banner-lead">
              The model returned JSON that does not match the required plan schema.
              Required root keys: {AI_PLAN_REQUIRED_ROOT_KEYS.join(", ")}.
            </p>
          ) : null}
          {invalidJson ? (
            <p className="aiplan__fail-banner-lead">
              The model returned text that could not be parsed as JSON.
            </p>
          ) : null}
          {noJson ? (
            <p className="aiplan__fail-banner-lead">
              The model did not return a JSON object.
            </p>
          ) : null}
          {result.telemetry?.repair_attempted ? (
            <p className="aiplan__truncated-note">
              Studio sent a schema repair prompt
              {result.telemetry.repair_success
                ? " — plan recovered."
                : ", but validation still failed."}
            </p>
          ) : null}
          {result.telemetry?.retried && !result.telemetry.repair_attempted ? (
            <p className="aiplan__truncated-note">
              Studio retried after truncation
              {result.telemetry.retry_success
                ? " — plan recovered."
                : ", but parsing still failed."}
            </p>
          ) : null}
        </section>

        {result.parseError ? (
          <section className="aiplan__fail-block">
            <h4 className="aiplan__fail-heading">Details</h4>
            <pre className="aiplan__fail-pre">{result.parseError}</pre>
          </section>
        ) : null}

        <section className="aiplan__fail-block">
          <h4 className="aiplan__fail-heading">Expected schema</h4>
          <pre className="aiplan__fail-pre aiplan__fail-pre--schema">
            {AI_PLAN_EXPECTED_SCHEMA}
          </pre>
        </section>

        {history.map((attempt, i) => (
          <section key={`${attempt.latencyMs}-${i}`} className="aiplan__fail-block">
            <h4 className="aiplan__fail-heading">
              {attemptLabel(i, history.length, attempt)}
            </h4>
            <p className="plan__muted">
              {attempt.error ?? "Parse failed"}
              {attempt.parseError ? ` — ${attempt.parseError}` : null}
            </p>
            {attempt.rawText ? (
              <pre className="aiplan__raw-pre aiplan__raw-pre--open">{attempt.rawText}</pre>
            ) : null}
          </section>
        ))}

        {result.rawText ? (
          <section className="aiplan__fail-block">
            <h4 className="aiplan__fail-heading">
              {result.telemetry?.repair_attempted
                ? "Schema repair output"
                : history.length > 0
                  ? "Latest output"
                  : "Raw model output"}
            </h4>
            <pre className="aiplan__raw-pre aiplan__raw-pre--open">{result.rawText}</pre>
          </section>
        ) : (
          <p className="plan__muted">No raw text was returned from the provider.</p>
        )}

        {result.telemetry ? (
          <details className="aiplan__telemetry">
            <summary>Telemetry</summary>
            <dl className="aiplan__telemetry-grid">
              <div>
                <dt>parse_fail_reason</dt>
                <dd>{result.telemetry.parse_fail_reason}</dd>
              </div>
              <div>
                <dt>truncation_detected</dt>
                <dd>{result.telemetry.truncation_detected ? "true" : "false"}</dd>
              </div>
              <div>
                <dt>retry_success</dt>
                <dd>{result.telemetry.retry_success ? "true" : "false"}</dd>
              </div>
              <div>
                <dt>retried</dt>
                <dd>{result.telemetry.retried ? "true" : "false"}</dd>
              </div>
              <div>
                <dt>repair_attempted</dt>
                <dd>{result.telemetry.repair_attempted ? "true" : "false"}</dd>
              </div>
              <div>
                <dt>repair_success</dt>
                <dd>{result.telemetry.repair_success ? "true" : "false"}</dd>
              </div>
            </dl>
          </details>
        ) : null}

        <button
          type="button"
          className="prov-btn prov-btn--primary aiplan__retry"
          disabled={aiPlanStatus === "running"}
          onClick={() => void runAIPlan()}
        >
          {aiPlanStatus === "running" ? "Retrying…" : "Retry AI Plan"}
        </button>
      </div>
    );
  }

  const plan = result.plan;

  const resolveAbs = (p: string): string | null => {
    if (!scan) return null;
    const target = basename(p);
    const hit =
      scan.files.find((f) => f.path === p.replace(/^\.\//, "")) ??
      scan.files.find((f) => basename(f.path) === target);
    return hit ? hit.absPath : null;
  };

  return (
    <div className="aiplan">
      {result.telemetry?.repair_success ? (
        <p className="aiplan__recovered">
          Plan recovered after schema repair (automatic).
        </p>
      ) : null}
      {result.telemetry?.retry_success && !result.telemetry.repair_success ? (
        <p className="aiplan__recovered">
          Plan recovered after truncated response (automatic retry).
        </p>
      ) : null}

      <div className="plan__head">
        <span className={`badge badge--conf-${plan.confidence.toLowerCase()}`}>
          Confidence: {plan.confidence}
        </span>
        <span className="aiplan__model">
          {result.model} · {result.latencyMs}ms
        </span>
      </div>

      <p className="plan__summary">{plan.summary}</p>

      <section className="plan__block">
        <h3 className="plan__heading">
          Files likely affected <span className="plan__count">{plan.files.length}</span>
        </h3>
        {plan.files.length === 0 ? (
          <p className="plan__muted">No files were identified.</p>
        ) : (
          <ul className="plan__files">
            {plan.files.map((file, i) => {
              const abs = resolveAbs(file.path);
              return (
                <li key={`${file.path}-${i}`} className="plan-file">
                  <div className="plan-file__head">
                    {abs ? (
                      <button
                        type="button"
                        className="plan-file__open"
                        onClick={() => void openPath(abs)}
                        title={`Open ${file.path}`}
                      >
                        <span className="plan-file__path">{file.path}</span>
                      </button>
                    ) : (
                      <span className="plan-file__path plan-file__path--plain">
                        {file.path}
                      </span>
                    )}
                  </div>
                  {file.reason ? (
                    <ul className="plan-file__reasons">
                      <li>{file.reason}</li>
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {plan.reasoning ? (
        <section className="plan__block">
          <h3 className="plan__heading">Reasoning</h3>
          <p className="aiplan__reasoning">{plan.reasoning}</p>
        </section>
      ) : null}

      <section className="plan__block">
        <h3 className="plan__heading">Risks</h3>
        {plan.risks.length === 0 ? (
          <p className="plan__muted">None reported.</p>
        ) : (
          <ul className="plan__changes">
            {plan.risks.map((risk, i) => (
              <li key={i}>{risk}</li>
            ))}
          </ul>
        )}
      </section>

      <p className="plan__readonly">
        AI plan only — no files have been or will be modified.
      </p>
    </div>
  );
}
