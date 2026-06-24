import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches render/runtime errors in the workspace shell so a bad agent/plan
 * state does not blank the entire Studio window.
 */
export class WorkspaceErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("[WorkspaceErrorBoundary]", error, info.componentStack);
  }

  private handleRetry = (): void => {
    this.setState({ error: null });
  };

  override render(): ReactNode {
    if (this.state.error) {
      const message = this.state.error.message || String(this.state.error);
      return (
        <div className="workspace-error" role="alert">
          <h2 className="workspace-error__title">Something went wrong</h2>
          <p className="workspace-error__lead">
            The workspace hit an unexpected error. You can recover without
            restarting Studio.
          </p>
          <pre className="workspace-error__detail">{message}</pre>
          <div className="workspace-error__actions">
            <button
              type="button"
              className="prov-btn prov-btn--primary"
              onClick={this.handleRetry}
            >
              Try again
            </button>
            <button
              type="button"
              className="prov-btn"
              onClick={() => window.location.reload()}
            >
              Reload app
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
