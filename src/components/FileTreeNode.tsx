import { useCallback, useState } from "react";
import type { FileNode } from "@/types";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { ChevronIcon, FileIcon, FolderIcon } from "@/components/icons";

interface FileTreeNodeProps {
  node: FileNode;
  depth: number;
}

/**
 * A single row in the file tree. Directories load their children lazily the
 * first time they are expanded; files open in the read-only editor on click.
 */
export function FileTreeNode({ node, depth }: FileTreeNodeProps) {
  const { activePath, openFile, listDirectory } = useWorkspace();
  const [expanded, setExpanded] = useState(false);
  const [children, setChildren] = useState<FileNode[] | null>(null);
  const [loading, setLoading] = useState(false);

  const isDirectory = node.type === "directory";
  const isActive = activePath === node.path;

  const handleClick = useCallback(async () => {
    if (!isDirectory) {
      void openFile(node);
      return;
    }
    const next = !expanded;
    setExpanded(next);
    if (next && children === null) {
      setLoading(true);
      const loaded = await listDirectory(node.path);
      setChildren(loaded);
      setLoading(false);
    }
  }, [isDirectory, expanded, children, node, openFile, listDirectory]);

  return (
    <li className="tree__item">
      <button
        type="button"
        className={`tree__row${isActive ? " tree__row--active" : ""}`}
        style={{ paddingLeft: `${depth * 14 + 8}px` }}
        onClick={handleClick}
        title={node.name}
      >
        {isDirectory ? (
          <ChevronIcon
            className={`tree__chevron${expanded ? " tree__chevron--open" : ""}`}
          />
        ) : (
          <span className="tree__chevron tree__chevron--spacer" />
        )}
        {isDirectory ? (
          <FolderIcon className="tree__icon tree__icon--dir" />
        ) : (
          <FileIcon className="tree__icon" />
        )}
        <span className="tree__label">{node.name}</span>
      </button>

      {isDirectory && expanded ? (
        <ul className="tree__children">
          {loading ? (
            <li className="tree__hint" style={{ paddingLeft: `${(depth + 1) * 14 + 24}px` }}>
              Loading…
            </li>
          ) : children && children.length > 0 ? (
            children.map((child) => (
              <FileTreeNode key={child.path} node={child} depth={depth + 1} />
            ))
          ) : children ? (
            <li className="tree__hint" style={{ paddingLeft: `${(depth + 1) * 14 + 24}px` }}>
              Empty
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}
