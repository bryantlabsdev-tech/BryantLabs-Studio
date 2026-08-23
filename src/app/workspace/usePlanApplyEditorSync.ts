import { useEffect, useRef } from "react";
import type { PlanApplySession } from "@/core/planApply";
import type { CenterTab } from "@/core/layout/types";
import type { FileNode } from "@/types";
import { evaluatePlanApplyEditorSync } from "@/app/workspace/planApplyEditorSync";

export function usePlanApplyEditorSync(input: {
  readonly planApplySession: PlanApplySession | null;
  readonly projectPath: string | null | undefined;
  readonly setCenterTab: (tab: CenterTab) => void;
  readonly openFile: (
    node: FileNode,
    opts?: { readonly revealEditor?: boolean },
  ) => Promise<void>;
}): void {
  const lastKeyRef = useRef<string | null>(null);
  const setCenterTabRef = useRef(input.setCenterTab);
  const openFileRef = useRef(input.openFile);
  setCenterTabRef.current = input.setCenterTab;
  openFileRef.current = input.openFile;

  useEffect(() => {
    const decision = evaluatePlanApplyEditorSync(lastKeyRef.current, {
      session: input.planApplySession,
      projectPath: input.projectPath,
    });
    lastKeyRef.current = decision.nextKey;
    if (!decision.reveal || !decision.target) return;

    setCenterTabRef.current("diff");
    void openFileRef.current(
      {
        name: decision.target.relPath.split("/").pop() ?? decision.target.relPath,
        path: decision.target.absPath,
        type: "file",
      },
      { revealEditor: false },
    );
  }, [input.planApplySession, input.projectPath]);
}
