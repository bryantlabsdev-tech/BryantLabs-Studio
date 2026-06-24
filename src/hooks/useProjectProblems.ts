import { useCallback, useEffect, useMemo, useState } from "react";
import * as monaco from "monaco-editor";
import type { BryantLabsApi } from "@/types";
import {
  IDLE_PROJECT_PROBLEMS_STATUS,
  mergeProblemsStatus,
  mergeProjectProblems,
  monacoMarkersToProblems,
  type ProjectProblem,
  type ProjectProblemsStatus,
} from "@/core/diagnostics/projectProblems";

export function useProjectProblems(input: {
  readonly api: BryantLabsApi | undefined;
  readonly projectPath: string | null;
}): {
  readonly projectProblems: readonly ProjectProblem[];
  readonly problemsStatus: ProjectProblemsStatus;
  readonly refreshProjectProblems: () => Promise<void>;
} {
  const [tscStatus, setTscStatus] = useState<ProjectProblemsStatus>(
    IDLE_PROJECT_PROBLEMS_STATUS,
  );
  const [monacoProblems, setMonacoProblems] = useState<ProjectProblem[]>([]);

  useEffect(() => {
    if (!input.projectPath) {
      setMonacoProblems([]);
      return;
    }

    let frame = 0;
    const refreshMonaco = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const markers = monaco.editor.getModelMarkers({});
        setMonacoProblems(
          monacoMarkersToProblems(input.projectPath!, markers),
        );
      });
    };

    const subscription = monaco.editor.onDidChangeMarkers(refreshMonaco);
    refreshMonaco();
    return () => {
      subscription.dispose();
      cancelAnimationFrame(frame);
    };
  }, [input.projectPath]);

  useEffect(() => {
    if (!input.api?.getProjectProblemsStatus || !input.projectPath) {
      setTscStatus(IDLE_PROJECT_PROBLEMS_STATUS);
      return;
    }

    const load = async () => {
      try {
        setTscStatus(await input.api!.getProjectProblemsStatus!());
      } catch {
        /* keep last status */
      }
    };

    void load();
    const offUpdated = input.api.onProjectProblemsUpdated?.((status) => {
      setTscStatus(status);
    });
    return () => {
      offUpdated?.();
    };
  }, [input.api, input.projectPath]);

  const projectProblems = useMemo(
    () => mergeProjectProblems(tscStatus.problems, monacoProblems),
    [tscStatus.problems, monacoProblems],
  );

  const problemsStatus = useMemo(
    () => mergeProblemsStatus(tscStatus, projectProblems),
    [tscStatus, projectProblems],
  );

  const refreshProjectProblems = useCallback(async () => {
    if (!input.api?.refreshProjectProblems) return;
    try {
      setTscStatus(await input.api.refreshProjectProblems());
    } catch {
      /* keep last status */
    }
  }, [input.api]);

  return {
    projectProblems,
    problemsStatus,
    refreshProjectProblems,
  };
}
