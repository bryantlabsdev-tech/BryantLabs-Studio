import { useEffect, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { WELCOME_EXAMPLE_PROMPTS } from "@/core/onboarding/examplePrompts";
import {
  shouldShowWelcomeScreen,
  writeOnboardingComplete,
} from "@/core/onboarding/firstRun";
import { readRecentProjects } from "@/core/project/recentProjects";
import { AgentIcon, FolderOpenIcon } from "@/components/icons";

const WORKFLOW_STEPS = [
  {
    title: "Build a new app",
    body: "Describe what you want in Agent chat. Studio scaffolds the project, runs checks, and opens a preview.",
  },
  {
    title: "Open an existing project",
    body: "Choose a folder on disk to browse files, run verification, and iterate with follow-up prompts.",
  },
  {
    title: "How the workflow works",
    body: "You prompt → Agent plans and writes files → you review changes → preview runs locally in the workbench.",
  },
] as const;

function dismissWelcome(setVisible: (visible: boolean) => void): void {
  writeOnboardingComplete();
  setVisible(false);
}

function focusComposer(): void {
  window.dispatchEvent(new CustomEvent("bryantlabs:focus-composer"));
}

function fillComposerPrompt(prompt: string): void {
  window.dispatchEvent(
    new CustomEvent("bryantlabs:fill-prompt", { detail: { prompt } }),
  );
}

/**
 * First-run overlay — orients new users before they open a project.
 */
export function WelcomeScreen() {
  const { project, openProject, openProjectAt, isDesktop, setRailTool } = useWorkspace();
  const [visible, setVisible] = useState(() => shouldShowWelcomeScreen(Boolean(project)));
  const [showExamples, setShowExamples] = useState(false);
  const recentProjects = readRecentProjects();

  useEffect(() => {
    if (project) {
      writeOnboardingComplete();
      setVisible(false);
    }
  }, [project]);

  if (!visible) return null;

  const dismiss = () => dismissWelcome(setVisible);

  const handleBuildNewApp = () => {
    dismiss();
    focusComposer();
  };

  const handleOpenProject = () => {
    dismiss();
    void openProject();
  };

  const handleOpenRecent = (path: string) => {
    dismiss();
    void openProjectAt(path);
  };

  const handleExamplePrompt = (prompt: string) => {
    dismiss();
    fillComposerPrompt(prompt);
    focusComposer();
  };

  return (
    <div
      className="welcome-screen"
      role="dialog"
      aria-modal="true"
      aria-labelledby="welcome-screen-title"
      data-testid="welcome-screen"
    >
      <div className="welcome-screen__backdrop" aria-hidden />
      <div className="welcome-screen__panel">
        <header className="welcome-screen__hero">
          <div className="welcome-screen__icon" aria-hidden>
            <AgentIcon />
          </div>
          <h1 id="welcome-screen-title" className="welcome-screen__title">
            Welcome to BryantLabs Studio
          </h1>
          <p className="welcome-screen__lede">
            Your local-first AI app builder. Start fresh or continue an existing codebase —
            everything runs on your machine.
          </p>
          <p className="welcome-screen__hint plan__muted">
            Before your first prompt, add an API key in{" "}
            <button
              type="button"
              className="welcome-screen__inline-link"
              onClick={() => {
                dismiss();
                setRailTool("providers");
              }}
            >
              Settings
            </button>{" "}
            (Ollama works locally without a cloud key).
          </p>
        </header>

        <ol className="welcome-screen__steps">
          {WORKFLOW_STEPS.map((step, index) => (
            <li key={step.title} className="welcome-screen__step">
              <span className="welcome-screen__step-num">{index + 1}</span>
              <div>
                <h2 className="welcome-screen__step-title">{step.title}</h2>
                <p className="welcome-screen__step-body">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="welcome-screen__actions">
          <button
            type="button"
            className="welcome-screen__action welcome-screen__action--primary"
            data-testid="welcome-build-new"
            onClick={handleBuildNewApp}
          >
            Start in Agent
          </button>
          <button
            type="button"
            className="welcome-screen__action"
            data-testid="welcome-open-project"
            disabled={!isDesktop}
            title={
              isDesktop ? "Open a local project folder" : "Available in the desktop app"
            }
            onClick={handleOpenProject}
          >
            <FolderOpenIcon className="welcome-screen__action-icon" aria-hidden />
            Open Project Folder
          </button>
          <button
            type="button"
            className="welcome-screen__action"
            data-testid="welcome-view-examples"
            aria-expanded={showExamples}
            onClick={() => setShowExamples((open) => !open)}
          >
            {showExamples ? "Hide Example Prompts" : "View Example Prompts"}
          </button>
        </div>

        {recentProjects.length > 0 && isDesktop ? (
          <section className="welcome-screen__recent" data-testid="welcome-recent-projects">
            <h2 className="welcome-screen__recent-title">Recent projects</h2>
            <ul className="welcome-screen__recent-list">
              {recentProjects.map((entry) => (
                <li key={entry.path}>
                  <button
                    type="button"
                    className="welcome-screen__recent-item"
                    onClick={() => handleOpenRecent(entry.path)}
                    title={entry.path}
                  >
                    <span className="welcome-screen__recent-name">{entry.name}</span>
                    <span className="welcome-screen__recent-path">{entry.path}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {showExamples ? (
          <ul className="welcome-screen__examples" data-testid="welcome-examples">
            {WELCOME_EXAMPLE_PROMPTS.map((prompt) => (
              <li key={prompt}>
                <button
                  type="button"
                  className="welcome-screen__example"
                  onClick={() => handleExamplePrompt(prompt)}
                >
                  {prompt}
                </button>
              </li>
            ))}
          </ul>
        ) : null}

        <footer className="welcome-screen__footer">
          <button type="button" className="welcome-screen__skip" onClick={dismiss}>
            Skip for now
          </button>
        </footer>
      </div>
    </div>
  );
}
