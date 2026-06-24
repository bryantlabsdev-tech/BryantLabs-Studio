import type { EditKind, EditParams, Patch, PatchError } from "@/core/editor/types";

/**
 * Deterministic, single-file text edits. Each function is a pure
 * (before, params) -> after transformation. No randomness, no AI.
 */

type CommentStyle = "line-slash" | "line-hash" | "block-c" | "block-html";

function commentStyle(path: string): CommentStyle {
  const ext = path.toLowerCase().split(".").pop() ?? "";
  if (["css", "scss", "less"].includes(ext)) return "block-c";
  if (["html", "htm", "xml", "svg", "vue"].includes(ext)) return "block-html";
  if (["md", "markdown"].includes(ext)) return "block-html";
  if (
    ["py", "rb", "sh", "bash", "zsh", "yml", "yaml", "toml", "ini", "conf"].includes(
      ext,
    )
  ) {
    return "line-hash";
  }
  return "line-slash";
}

function renderComment(path: string, text: string): string {
  const style = commentStyle(path);
  const lines = text.split("\n");
  switch (style) {
    case "line-slash":
      return lines.map((l) => `// ${l}`).join("\n");
    case "line-hash":
      return lines.map((l) => `# ${l}`).join("\n");
    case "block-c":
      return `/* ${text} */`;
    case "block-html":
      return `<!-- ${text} -->`;
  }
}

function isError(value: Patch | PatchError): value is PatchError {
  return "error" in value;
}

export function createPatch(
  kind: EditKind,
  before: string,
  params: EditParams,
  path: string,
): Patch | PatchError {
  switch (kind) {
    case "prepend-comment": {
      const text = params.comment?.trim();
      if (!text) return { error: "Enter the comment text to add." };
      const comment = renderComment(path, text);
      const after = `${comment}\n${before}`;
      return {
        kind,
        before,
        after,
        description: "Add a comment to the top of the file.",
      };
    }

    case "replace-text": {
      const find = params.find ?? "";
      if (find === "") return { error: "Enter the exact text to replace." };
      if (!before.includes(find)) {
        return { error: "The exact text was not found in the file." };
      }
      const replace = params.replace ?? "";
      const count = before.split(find).length - 1;
      const after = before.split(find).join(replace);
      return {
        kind,
        before,
        after,
        description: `Replace ${count} exact occurrence${count === 1 ? "" : "s"} of the selected text.`,
      };
    }

    case "append-note": {
      const note = params.note?.trim();
      if (!note) return { error: "Enter the note text to append." };
      const separator = before.length === 0 || before.endsWith("\n") ? "" : "\n";
      const after = `${before}${separator}${note}\n`;
      return {
        kind,
        before,
        after,
        description: "Append a note to the end of the file.",
      };
    }
  }
}

export { isError as isPatchError };
