import { useEffect, useRef, useState } from "react";
import type { FileNode, ProjectInfo } from "@/types";
import { useWorkspace } from "@/app/workspaceContext";
import { FileTreeNode } from "@/components/FileTreeNode";

interface FileTreeProps {
  project: ProjectInfo;
}

/**
 * Root of the file tree. Loads the project's top-level entries, then defers to
 * FileTreeNode for lazy expansion deeper in the hierarchy.
 */
export function FileTree({ project }: FileTreeProps) {
  const { listDirectory, greenfieldRun } = useWorkspace();
  const [roots, setRoots] = useState<FileNode[] | null>(null);
  const writtenKey = greenfieldRun.filesWritten.join("\0");
  const listDirectoryRef = useRef(listDirectory);
  listDirectoryRef.current = listDirectory;

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      void listDirectoryRef.current(project.path).then((nodes) => {
        if (cancelled) return;
        setRoots((prev) => {
          if (
            prev &&
            prev.length === nodes.length &&
            prev.every((node, i) => node.path === nodes[i]?.path && node.type === nodes[i]?.type)
          ) {
            return prev;
          }
          return nodes;
        });
      });
    };
    load();
    const unsubscribe = window.bryantlabs?.onProjectIndexUpdated?.(() => {
      load();
    });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [project.path, writtenKey]);

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
