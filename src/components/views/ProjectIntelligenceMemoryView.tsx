import type { MemoryRecommendation, ProjectIntelligence } from "@/core/projectIntelligence/types";
import {
  buildMemoryRecommendations,
  buildPreferredFixPrompt,
} from "@/core/projectIntelligence/recommendations";
import { formatConfidencePercent } from "@/core/projectIntelligence/confidence";

interface ProjectIntelligenceMemoryViewProps {
  readonly intelligence: ProjectIntelligence;
  readonly projectName?: string | null;
  readonly onApplyPreferredFix?: (recommendation: MemoryRecommendation) => void;
  readonly applyRunning?: boolean;
}

function Section({
  title,
  children,
  empty,
}: {
  readonly title: string;
  readonly children: React.ReactNode;
  readonly empty?: string;
}) {
  return (
    <section className="project-intelligence__section">
      <h4 className="project-intelligence__section-title">{title}</h4>
      {children ?? <p className="plan__muted">{empty ?? "None recorded yet."}</p>}
    </section>
  );
}

function ChipList({ items }: { readonly items: readonly string[] }) {
  if (items.length === 0) return null;
  return (
    <ul className="project-intelligence__chips">
      {items.map((item) => (
        <li key={item} className="project-intelligence__chip">
          {item}
        </li>
      ))}
    </ul>
  );
}

export function ProjectIntelligenceMemoryView({
  intelligence,
  projectName,
  onApplyPreferredFix,
  applyRunning = false,
}: ProjectIntelligenceMemoryViewProps) {
  const title = projectName?.trim() || intelligence.projectName || "Project Intelligence";
  const recommendations = buildMemoryRecommendations(intelligence);

  return (
    <div className="project-intelligence" data-testid="project-intelligence-memory">
      <header className="project-intelligence__head">
        <h3>{title}</h3>
        <p className="plan__muted">
          Active memory used to guide planner and apply runs on this project.
        </p>
      </header>

      <Section title="Project Stack">
        <dl className="project-intelligence__stack run-inspector__metrics">
          <div>
            <dt>Framework</dt>
            <dd>{intelligence.framework || "—"}</dd>
          </div>
          <div>
            <dt>Language</dt>
            <dd>{intelligence.language || "—"}</dd>
          </div>
          <div>
            <dt>Build system</dt>
            <dd>{intelligence.buildSystem || "—"}</dd>
          </div>
          <div>
            <dt>Styling</dt>
            <dd>{intelligence.stylingSystem || "—"}</dd>
          </div>
          <div>
            <dt>Package manager</dt>
            <dd>{intelligence.packageManager || "—"}</dd>
          </div>
          <div>
            <dt>Architecture</dt>
            <dd>{intelligence.detectedArchitecture || "—"}</dd>
          </div>
        </dl>
      </Section>

      <Section title="Known Patterns" empty="No UI patterns detected yet.">
        <ChipList items={intelligence.recurringUiPatterns} />
      </Section>

      <Section title="Recurring Issues" empty="No recurring audit issues yet.">
        {intelligence.recurringAuditIssues.length > 0 ? (
          <ul className="project-intelligence__issues">
            {intelligence.recurringAuditIssues.map((issue) => (
              <li key={issue.id}>
                <code>{issue.label}</code>
                <span className="plan__muted"> ({issue.occurrences} occurrences)</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Successful Fixes" empty="No successful fixes recorded yet.">
        {intelligence.fixConfidence.length > 0 ? (
          <ul className="project-intelligence__fixes">
            {intelligence.fixConfidence.map((fix) => (
              <li key={`${fix.issueId}-${fix.fixLabel}`}>
                <code>{fix.issueId}</code> → {fix.fixLabel}
                <span className="plan__muted">
                  {" "}
                  · {formatConfidencePercent(fix.confidenceScore)} · {fix.successes}/
                  {fix.successes + fix.failures}
                </span>
              </li>
            ))}
          </ul>
        ) : intelligence.successfulFixes.length > 0 ? (
          <ul className="project-intelligence__fixes">
            {intelligence.successfulFixes.map((fix) => (
              <li key={fix.id}>
                {fix.label}
                <span className="plan__muted"> ×{fix.occurrences}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Failed Fixes" empty="No failed fixes recorded yet.">
        {intelligence.failedFixMemory.length > 0 ? (
          <ul className="project-intelligence__fixes project-intelligence__fixes--failed">
            {intelligence.failedFixMemory.map((fix) => (
              <li key={fix.id}>
                {fix.label}
                <span className="plan__muted"> ×{fix.occurrences}</span>
              </li>
            ))}
          </ul>
        ) : intelligence.failedFixes.length > 0 ? (
          <ul className="project-intelligence__fixes project-intelligence__fixes--failed">
            {intelligence.failedFixes.map((fix) => (
              <li key={fix.id}>
                {fix.label}
                <span className="plan__muted"> ×{fix.occurrences}</span>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      <Section title="Agent Recommendations" empty="Recommendations appear after recurring issues are detected.">
        {recommendations.length > 0 ? (
          <ul className="project-intelligence__recommendations">
            {recommendations.map((rec) => (
              <li key={rec.issueId} className="project-intelligence__recommendation">
                <p className="project-intelligence__insight">
                  <strong>Agent Insight:</strong> {rec.issueLabel} has appeared {rec.occurrences}{" "}
                  times.
                </p>
                <p>
                  Most successful fix: <strong>{rec.recommendedFix}</strong>
                </p>
                <p className="plan__muted">Confidence: {formatConfidencePercent(rec.confidenceScore)}</p>
                {onApplyPreferredFix ? (
                  <button
                    type="button"
                    className="prov-btn prov-btn--primary project-intelligence__apply-fix"
                    data-testid={`apply-preferred-fix-${rec.issueId}`}
                    disabled={applyRunning}
                    onClick={() => onApplyPreferredFix(rec)}
                  >
                    {applyRunning ? "Applying..." : "Apply Preferred Fix"}
                  </button>
                ) : null}
                <details className="project-intelligence__prompt-preview">
                  <summary className="plan__muted">Preview follow-up prompt</summary>
                  <pre>{buildPreferredFixPrompt(rec)}</pre>
                </details>
              </li>
            ))}
          </ul>
        ) : null}
      </Section>

      {intelligence.recentLearnings.length > 0 ? (
        <Section title="Recent Agent Learnings">
          <ol className="project-intelligence__learnings">
            {intelligence.recentLearnings.slice(0, 8).map((learning) => (
              <li key={learning.id}>
                <p>{learning.text}</p>
                <span className="plan__muted">
                  {learning.runNumber != null ? `Run #${learning.runNumber}` : "Run"}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      ) : null}
    </div>
  );
}
