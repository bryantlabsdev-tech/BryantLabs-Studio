import type { ReactNode } from "react";

export type AgentTimelineCardTone = "default" | "running" | "success" | "failed";

export interface AgentTimelineCardProps {
  readonly icon: string;
  readonly title: string;
  readonly meta?: string | null;
  readonly tone?: AgentTimelineCardTone;
  readonly children: ReactNode;
  readonly testId?: string;
}

export function AgentTimelineCard({
  icon,
  title,
  meta = null,
  tone = "default",
  children,
  testId,
}: AgentTimelineCardProps) {
  return (
    <section
      className={[
        "agent-timeline-card",
        tone !== "default" ? `agent-timeline-card--${tone}` : "",
      ]
        .filter(Boolean)
        .join(" ")}
      {...(testId ? { "data-testid": testId } : {})}
    >
      <header className="agent-timeline-card__head">
        <span className="agent-timeline-card__icon" aria-hidden>
          {icon}
        </span>
        <h4 className="agent-timeline-card__title">{title}</h4>
        {meta ? <span className="agent-timeline-card__meta">{meta}</span> : null}
      </header>
      <div className="agent-timeline-card__body">{children}</div>
    </section>
  );
}

export function AgentTimeline({ children }: { readonly children: ReactNode }) {
  return <div className="agent-timeline">{children}</div>;
}
