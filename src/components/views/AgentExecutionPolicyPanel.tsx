import { AGENT_EXECUTION_POLICY_LABEL } from "@/core/agent/agentExecutionPolicy";

export const AGENT_EXECUTION_POLICY_TEST_ID = "agent-execution-policy";

interface PolicySnapshot {
  readonly label: string;
  readonly isolationLevel: string;
  readonly osSandboxClaimed: boolean;
  readonly kernelFirewall?: boolean;
  readonly autonomousInspection?: string;
  readonly approvedProjectCode?: string;
  readonly filesystemScope: string;
  readonly shellEnabled: boolean;
  readonly gitMutationAvailableToAgents: boolean;
  readonly network: string;
  readonly environment: string;
  readonly processLimits?: string;
  readonly timeoutMs: number;
  readonly maxOutputChars: number;
  readonly maxConcurrency: number;
  readonly cancellation: string;
  readonly allowedRecipes?: readonly string[];
  readonly allowedCommands?: readonly string[];
  readonly privilegedOutsideAgent: readonly string[];
}

interface DenialRow {
  readonly at: number;
  readonly code: string;
  readonly executionClass: string;
  readonly reason: string;
}

/**
 * Read-only Agent execution policy. Application enforcement only — not an OS sandbox.
 */
export function AgentExecutionPolicyPanel(props: {
  readonly snapshot: PolicySnapshot | null;
  readonly denials: readonly DenialRow[];
}) {
  const snapshot = props.snapshot;
  return (
    <section className="agent-execution-policy" data-testid={AGENT_EXECUTION_POLICY_TEST_ID}>
      <h3 className="agent-execution-policy__title">
        {snapshot?.label ?? AGENT_EXECUTION_POLICY_LABEL}
      </h3>
      <p className="agent-execution-policy__lede">
        These restrictions apply to agent-initiated inspect recipes. They are
        application policy, not kernel, container, or VM isolation.
      </p>
      {snapshot ? (
        <dl className="agent-execution-policy__list">
          <dt>Isolation</dt>
          <dd data-testid="agent-execution-isolation">
            {snapshot.isolationLevel}
            {snapshot.osSandboxClaimed ? "" : " (not an OS sandbox)"}
          </dd>
          <dt>Autonomous inspection</dt>
          <dd data-testid="agent-execution-autonomous">{snapshot.autonomousInspection}</dd>
          <dt>Project code</dt>
          <dd data-testid="agent-execution-project-code">{snapshot.approvedProjectCode}</dd>
          <dt>Filesystem</dt>
          <dd data-testid="agent-execution-filesystem">{snapshot.filesystemScope}</dd>
          <dt>Network</dt>
          <dd data-testid="agent-execution-network">{snapshot.network}</dd>
          <dt>Shell</dt>
          <dd>{snapshot.shellEnabled ? "enabled" : "disabled"}</dd>
          <dt>Git mutation</dt>
          <dd>
            {snapshot.gitMutationAvailableToAgents
              ? "available to agents"
              : "unavailable to agents"}
          </dd>
          <dt>Environment</dt>
          <dd>{snapshot.environment}</dd>
          <dt>Lifecycle limits</dt>
          <dd data-testid="agent-execution-limits">
            {snapshot.processLimits} timeout {snapshot.timeoutMs}ms · output{" "}
            {snapshot.maxOutputChars} chars · concurrency {snapshot.maxConcurrency}
          </dd>
          <dt>Cancellation</dt>
          <dd>{snapshot.cancellation}</dd>
          <dt>Allowed autonomous recipes</dt>
          <dd>
            <ul>
              {(snapshot.allowedRecipes ?? snapshot.allowedCommands ?? []).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </dd>
          <dt>Outside agent authority</dt>
          <dd>
            <ul>
              {snapshot.privilegedOutsideAgent.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </dd>
        </dl>
      ) : (
        <p className="agent-execution-policy__lede">Policy snapshot unavailable.</p>
      )}
      {props.denials.length > 0 ? (
        <div className="agent-execution-policy__denials" data-testid="agent-execution-denials">
          <h4>Recent denials</h4>
          <ul>
            {props.denials.map((row, index) => (
              <li key={`${row.at}-${index}`}>
                {row.code}: {row.reason}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
