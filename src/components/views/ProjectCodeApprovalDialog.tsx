export interface ProjectCodeApprovalPreview {
  readonly previewId: string;
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly workingDirectory: string;
  readonly networkLimitation: string;
  readonly timeoutMs: number;
  readonly risk: string;
}

/**
 * Visible confirmation for one project-code run. Application policy only.
 */
export function ProjectCodeApprovalDialog(props: {
  readonly preview: ProjectCodeApprovalPreview;
  readonly busy: boolean;
  readonly onApprove: () => void;
  readonly onCancel: () => void;
}) {
  const preview = props.preview;
  return (
    <div className="project-code-approval" role="dialog" aria-modal="true" data-testid="project-code-approval">
      <h3>Review project code</h3>
      <p data-testid="project-code-risk">{preview.risk}</p>
      <p>Approval happens in a Studio confirmation window. This page cannot approve the run.</p>
      <dl>
        <dt>Executable</dt>
        <dd data-testid="project-code-executable">{preview.executable}</dd>
        <dt>Arguments</dt>
        <dd data-testid="project-code-arguments">{preview.arguments.join(" ")}</dd>
        <dt>Working directory</dt>
        <dd data-testid="project-code-cwd">{preview.workingDirectory}</dd>
        <dt>Network</dt>
        <dd data-testid="project-code-network">{preview.networkLimitation}</dd>
        <dt>Timeout</dt>
        <dd data-testid="project-code-timeout">{preview.timeoutMs}ms</dd>
      </dl>
      <div className="project-code-approval__actions">
        <button type="button" data-testid="project-code-cancel" onClick={props.onCancel} disabled={props.busy}>
          Cancel
        </button>
        <button type="button" data-testid="project-code-approve" onClick={props.onApprove} disabled={props.busy}>
          Continue to confirmation
        </button>
      </div>
    </div>
  );
}
