import { useEffect, useState } from "react";
import type { FileNode, ProjectInfo } from "@/types";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { FileTreeNode } from "@/components/FileTreeNode";

interface FileTreeProps {
  project: ProjectInfo;
}

/**
 * Root of the file tree. Loads the project's top-level entries, then defers to
 * FileTreeNode for lazy expansion deeper in the hierarchy.
 */
export function FileTree({ project }: FileTreeProps) {
  const { listDirectory } = useWorkspace();
  const [roots, setRoots] = useState<FileNode[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    setRoots(null);
    void listDirectory(project.path).then((nodes) => {
      if (!cancelled) setRoots(nodes);
    });
    return () => {
      cancelled = true;
    };
  }, [project.path, listDirectory]);

  if (roots === null) {
    return <p className="tree__hint">Loading project…</p>;
  }

  if (roots.length === 0) {
    return <p className="tree__hint">This folder is empty.</p>;
  }

  return (
    <ul className="tree">
      {roots.map((node) => (
        <FileTreeNode key={node.path} node={node} depth={0} />
      ))}
    </ul>
  );
}
