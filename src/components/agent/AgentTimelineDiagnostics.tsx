import type { AgentRunCardViewModel } from "@/core/agent/agentRunCard";
import type { AgentRunArtifact } from "@/core/agent/agentRunHistory";
import type { GreenfieldRunSnapshot } from "@/core/greenfield/runState";

export interface AgentTimelineDiagnosticsProps {
  readonly card: AgentRunCardViewModel;
  readonly artifact?: AgentRunArtifact | null;
  readonly greenfieldRun?: GreenfieldRunSnapshot | null;
}

interface DiagnosticStage {
  readonly id: string;
  readonly label: string;
  readonly lines: readonly string[];
}

function planningLines(card: AgentRunCardViewModel): string[] {
  const lines: string[] = [];
  if (card.reasoning.headline.trim()) lines.push(card.reasoning.headline.trim());
  for (const step of card.reasoning.planSteps.slice(0, 4)) {
    lines.push(step);
  }
  for (const item of card.reasoning.plannerReasoning.slice(0, 3)) {
    lines.push(item);
  }
  return lines;
}

function fileSelectionLines(card: AgentRunCardViewModel): string[] {
  const lines: string[] = [];
  for (const file of card.patchImpact.files.slice(0, 6)) {
    lines.push(`${file.path} (+${file.added}/−${file.removed})`);
  }
  if (card.patchImpact.files.length > 0) {
    lines.push(
      `${card.patchImpact.complexity} complexity · ${card.patchImpact.risk} risk · ${card.patchImpact.estimatedTime}`,
    );
  }
  for (const file of card.fileActivity.slice(0, 4)) {
    lines.push(`${file.status === "written" ? "Written" : "Editing"}: ${file.path}`);
  }
  return lines;
}

function parserLines(
  card: AgentRunCardViewModel,
  artifact: AgentRunArtifact | null,
): string[] {
  const lines: string[] = [];
  const diag = card.diagnostics.items[0];
  if (diag?.whatFailed) lines.push(diag.whatFailed);
  if (card.failureDetails?.filesParsed != null) {
    lines.push(
      `Parsed ${card.failureDetails.filesParsed} / ${card.failureDetails.filesExpected ?? "?"} files`,
    );
  }
  if (card.failureDetails?.missingFiles.length) {
    lines.push(`Missing: ${card.failureDetails.missingFiles.join(", ")}`);
  }
  if (artifact?.generationMetrics) {
    lines.push(`Generation total: ${artifact.generationMetrics.totalMs}ms`);
  }
  return lines;
}

function applyLines(card: AgentRunCardViewModel): string[] {
  const lines: string[] = [];
  for (const file of card.filesModified.slice(0, 6)) {
    lines.push(`Applied: ${file}`);
  }
  for (const file of card.filesWritten.slice(0, 4)) {
    lines.push(`Written: ${file}`);
  }
  return lines;
}

function verificationLines(card: AgentRunCardViewModel): string[] {
  const v = card.verification;
  const lines: string[] = [];
  if (v.typescript !== "pending") lines.push(`TypeScript: ${v.typescript}`);
  if (v.build !== "pending") lines.push(`Build: ${v.build}`);
  if (v.uiAudit !== "pending") lines.push(`UI audit: ${v.uiAudit}`);
  if (v.preview !== "pending") lines.push(`Preview: ${v.preview}`);
  return lines;
}

function buildStages(
  card: AgentRunCardViewModel,
  artifact: AgentRunArtifact | null,
): DiagnosticStage[] {
  const stages: DiagnosticStage[] = [
    { id: "planning", label: "Planning diagnostics", lines: planningLines(card) },
    { id: "file-selection", label: "File selection diagnostics", lines: fileSelectionLines(card) },
    { id: "parser", label: "Parser diagnostics", lines: parserLines(card, artifact) },
    { id: "apply", label: "Apply diagnostics", lines: applyLines(card) },
    { id: "verification", label: "Verification diagnostics", lines: verificationLines(card) },
  ];
  return stages.filter((stage) => stage.lines.length > 0);
}

export function AgentTimelineDiagnostics({
  card,
  artifact = null,
}: AgentTimelineDiagnosticsProps) {
  const stages = buildStages(card, artifact);
  if (stages.length === 0) return null;

  return (
    <div className="agent-inline-diagnostics" data-testid="agent-timeline-diagnostics">
      {stages.map((stage) => (
        <details key={stage.id} className="agent-inline-diagnostics__stage" open={stage.id === "planning"}>
          <summary>{stage.label}</summary>
          <div className="agent-inline-diagnostics__stage-body">
            <ul className="agent-timeline-card__list">
              {stage.lines.map((line) => (
                <li key={line} className="agent-timeline-card__list-item">
                  {line}
                </li>
              ))}
            </ul>
          </div>
        </details>
      ))}
    </div>
  );
}
