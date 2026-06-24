import type { GreenfieldGenerationMetrics } from "@/core/greenfield/metrics";

interface GreenfieldMetricsPanelProps {
  metrics: GreenfieldGenerationMetrics;
  defaultOpen?: boolean;
}

/**
 * Read-only greenfield timing/size instrumentation.
 */
export function GreenfieldMetricsPanel({
  metrics,
  defaultOpen = false,
}: GreenfieldMetricsPanelProps) {
  return (
    <details className="gf-debug__details" open={defaultOpen}>
      <summary className="gf-debug__summary">Generation metrics</summary>
      <dl className="gf-debug__list">
        <Row label="Prompt size" value={`${metrics.promptCharCount} chars / ${metrics.promptByteCount} bytes (~${metrics.estimatedPromptTokens} tok est.)`} />
        <Row label="User prompt" value={`${metrics.userPromptCharCount} chars`} />
        <Row label="Response size" value={`${metrics.responseCharCount} chars / ${metrics.responseByteCount} bytes (~${metrics.estimatedResponseTokens} tok est.)`} />
        <Row
          label="Configured maxOutputTokens"
          value={String(metrics.maxOutputTokens)}
        />
        <Row label="Single request (7 files)" value={metrics.singleRequestAllFiles ? "yes" : "no"} />
        <Row label="Provider wait" value={`${metrics.providerWaitMs} ms`} />
        <Row label="Parse time" value={`${metrics.parseMs} ms`} />
        <Row label="Total duration" value={`${metrics.totalMs} ms`} />
        {metrics.providerConfiguredTimeoutMs !== undefined ? (
          <>
            <Row
              label="Configured timeout"
              value={`${metrics.providerConfiguredTimeoutMs} ms (${Math.round(metrics.providerConfiguredTimeoutMs / 1000)} s)`}
            />
            <Row
              label="Elapsed vs timeout"
              value={`${metrics.providerWaitMs} ms / ${metrics.providerConfiguredTimeoutMs} ms`}
            />
          </>
        ) : null}
      </dl>
    </details>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <>
      <dt className="gf-debug__term">{label}</dt>
      <dd className="gf-debug__value">{value}</dd>
    </>
  );
}
