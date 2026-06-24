import { useEffect, useRef, useState } from "react";
import {
  loadProjectIntelligence,
  normalizeProjectIntelligence,
} from "@/core/projectIntelligence/store";
import type { ProjectIntelligence } from "@/core/projectIntelligence/types";

export interface ProjectIntelligenceWorkspaceState {
  readonly projectIntelligence: ProjectIntelligence;
  readonly setProjectIntelligence: React.Dispatch<
    React.SetStateAction<ProjectIntelligence>
  >;
  readonly projectIntelligenceRef: React.MutableRefObject<ProjectIntelligence>;
}

export function useProjectIntelligenceWorkspaceState(
  projectPath: string | undefined,
  projectName: string | null | undefined,
): ProjectIntelligenceWorkspaceState {
  const [projectIntelligence, setProjectIntelligence] = useState<ProjectIntelligence>(
    () =>
      normalizeProjectIntelligence(
        loadProjectIntelligence(projectPath),
        projectPath ?? "",
        projectName ?? "",
      ),
  );
  const projectIntelligenceRef = useRef(projectIntelligence);
  projectIntelligenceRef.current = projectIntelligence;

  useEffect(() => {
    setProjectIntelligence(
      normalizeProjectIntelligence(
        loadProjectIntelligence(projectPath),
        projectPath ?? "",
        projectName ?? "",
      ),
    );
  }, [projectPath, projectName]);

  return {
    projectIntelligence,
    setProjectIntelligence,
    projectIntelligenceRef,
  };
}
