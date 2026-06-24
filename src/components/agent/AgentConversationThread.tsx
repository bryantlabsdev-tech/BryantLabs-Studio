import type { ReactNode } from "react";

export interface AgentConversationThreadProps {
  readonly children: ReactNode;
  readonly runCount?: number;
}

/** Continuous project conversation wrapper — soft thread chrome, not isolated run panels. */
export function AgentConversationThread({
  children,
}: AgentConversationThreadProps) {
  return (
    <section
      className="agent-conversation-thread"
      data-testid="agent-conversation-thread"
      aria-label="Project conversation"
    >
      <div className="agent-conversation-thread__body">{children}</div>
    </section>
  );
}

export function AgentThreadContinuation() {
  return (
    <div className="agent-thread-continuation" aria-hidden data-testid="agent-thread-continuation">
      <span className="agent-thread-continuation__line" />
      <span className="agent-thread-continuation__label">Follow-up</span>
      <span className="agent-thread-continuation__line" />
    </div>
  );
}
