import { WorkspaceProvider } from "@/app/WorkspaceProvider";
import { TitleBar } from "@/components/TitleBar";
import { ResizableWorkspace } from "@/components/ResizableWorkspace";
import { StatusBar } from "@/components/StatusBar";
import { WelcomeScreen } from "@/components/WelcomeScreen";
import { DiagnosticReportModalHost } from "@/components/views/DiagnosticReportModalHost";
import { RunInspectorModalHost } from "@/components/views/RunInspectorModalHost";
import { RunCompareModalHost } from "@/components/views/RunCompareModalHost";
import "./App.css";
import "@/styles/workspace-shell.css";
import "@/styles/welcome-screen.css";
import "@/styles/editor.css";
import "@/styles/sidebar-panels.css";
import "@/styles/polish.css";
import "@/styles/greenfield.css";
import "@/styles/build-view.css";
import "@/styles/workflow-panels.css";
import "@/styles/agent-conversation.css";
import "@/styles/agent-workspace.css";
import "@/styles/run-inspector.css";
import "@/styles/studio-run-log.css";
import "@/styles/workbench.css";
import "@/styles/exec-dashboard.css";

/**
 * Cursor-style workspace: icon rail, agent left, editor center, details right.
 */
export function App() {
  return (
    <WorkspaceProvider>
      <div className="app">
        <TitleBar />
        <ResizableWorkspace />
        <StatusBar />
        <WelcomeScreen />
        <RunInspectorModalHost />
        <DiagnosticReportModalHost />
        <RunCompareModalHost />
      </div>
    </WorkspaceProvider>
  );
}
