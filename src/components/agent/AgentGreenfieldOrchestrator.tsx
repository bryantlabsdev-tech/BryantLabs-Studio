import { NewAppView } from "@/components/views/NewAppView";

export interface AgentGreenfieldOrchestratorProps {
  readonly initialPrompt: string;
  readonly initialFolder: { readonly path: string; readonly name: string };
  readonly greenfieldRecovery?: boolean;
  readonly agentRunBlockReason?: string | null;
  readonly onGreenfieldComplete: () => Promise<void>;
  readonly onAgentGreenfieldSuccess: (input: {
    prompt: string;
    filesWritten: readonly string[];
    typecheckPassed: boolean;
    buildPassed: boolean;
    previewReady: boolean;
    uiAuditPassed: boolean;
  }) => void;
  readonly onComplete: () => void;
  readonly onCancel: () => void;
  readonly onSubmissionError?: (message: string) => void;
}

/**
 * Headless greenfield driver for One Agent — runs generation without mounting
 * legacy New App wizard UI in the chat column.
 */
export function AgentGreenfieldOrchestrator({
  initialPrompt,
  initialFolder,
  greenfieldRecovery = false,
  agentRunBlockReason = null,
  onGreenfieldComplete,
  onAgentGreenfieldSuccess,
  onComplete,
  onCancel,
  onSubmissionError,
}: AgentGreenfieldOrchestratorProps) {
  return (
    <NewAppView
      embedded
      headless
      agentOnly
      initialPrompt={initialPrompt}
      initialFolder={initialFolder}
      autoStartGeneration={!greenfieldRecovery}
      greenfieldRecovery={greenfieldRecovery}
      agentRunBlockReason={agentRunBlockReason}
      onGreenfieldComplete={onGreenfieldComplete}
      onAgentGreenfieldSuccess={onAgentGreenfieldSuccess}
      onComplete={onComplete}
      onCancel={onCancel}
      {...(onSubmissionError ? { onSubmissionError } : {})}
    />
  );
}
