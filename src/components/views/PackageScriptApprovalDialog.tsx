export interface PackageScriptApprovalPreview {
  readonly previewId: string;
  readonly scriptName: string;
  readonly scriptBody: string;
  readonly executable: string;
  readonly arguments: readonly string[];
  readonly path: string;
  readonly workingDirectory: string;
  readonly timeoutMs: number;
  readonly environmentPolicy: string;
  readonly shellWarning: string;
  readonly packageJsonSha256: string;
  readonly scriptBodySha256: string;
  readonly lockfileSha256: string;
  readonly binDirectorySha256: string;
}

/**
 * Visible review for one package-script run. Approval is completed in the main-owned window.
 */
export function PackageScriptApprovalDialog(props: {
  readonly preview: PackageScriptApprovalPreview;
  readonly busy: boolean;
  readonly onApprove: () => void;
  readonly onCancel: () => void;
}) {
  const preview = props.preview;
  return (
    <div className="project-code-approval" role="dialog" aria-modal="true" data-testid="package-script-approval">
      <h3>Review package script</h3>
      <p data-testid="package-script-warning">{preview.shellWarning}</p>
      <p>Approval happens in a Studio confirmation window. This page cannot approve the run.</p>
      <dl>
        <dt>Script name</dt>
        <dd data-testid="package-script-name">{preview.scriptName}</dd>
        <dt>Script body</dt>
        <dd data-testid="package-script-body">{preview.scriptBody}</dd>
        <dt>Shell</dt>
        <dd data-testid="package-script-executable">{preview.executable}</dd>
        <dt>Script arguments</dt>
        <dd data-testid="package-script-arguments">{preview.arguments.length === 0 ? "none" : preview.arguments.join(" ")}</dd>
        <dt>PATH</dt>
        <dd data-testid="package-script-path">{preview.path}</dd>
        <dt>node_modules/.bin</dt>
        <dd data-testid="package-script-bin">{preview.binDirectorySha256}</dd>
        <dt>Project root</dt>
        <dd data-testid="package-script-cwd">{preview.workingDirectory}</dd>
        <dt>Timeout</dt>
        <dd data-testid="package-script-timeout">{preview.timeoutMs}ms</dd>
        <dt>Environment policy</dt>
        <dd data-testid="package-script-environment">{preview.environmentPolicy}</dd>
        <dt>package.json</dt>
        <dd data-testid="package-script-manifest">{preview.packageJsonSha256}</dd>
        <dt>Lockfile</dt>
        <dd data-testid="package-script-lockfile">{preview.lockfileSha256 || "(no package-lock.json)"}</dd>
      </dl>
      <div className="project-code-approval__actions">
        <button type="button" data-testid="package-script-cancel" onClick={props.onCancel} disabled={props.busy}>
          Cancel
        </button>
        <button type="button" data-testid="package-script-approve" onClick={props.onApprove} disabled={props.busy}>
          Continue to confirmation
        </button>
      </div>
    </div>
  );
}
