import type { editor, IDisposable } from "monaco-editor";
import { computeDiff } from "@/core/editor/diff";
import { firstPatchChangeLine } from "@/core/editor/patchReviewOverlay";

export interface PatchReviewDecorationInput {
  readonly before: string;
  readonly after: string;
  readonly onAccept: () => void;
  readonly onReject: () => void;
}

type MonacoApi = typeof import("monaco-editor");

export function applyPatchReviewDecorations(
  monaco: MonacoApi,
  editorInstance: editor.IStandaloneCodeEditor,
  review: PatchReviewDecorationInput | null,
): IDisposable {
  const collection = editorInstance.createDecorationsCollection([]);
  let widget: editor.IContentWidget | null = null;

  const disposeWidget = () => {
    if (widget) {
      editorInstance.removeContentWidget(widget);
      widget = null;
    }
  };

  if (!review) {
    return {
      dispose: () => {
        collection.clear();
        disposeWidget();
      },
    };
  }

  const diffRows = computeDiff(review.before, review.after);
  const decorations: editor.IModelDeltaDecoration[] = [];

  for (const row of diffRows) {
    if (row.type === "add" && row.rightNo != null) {
      decorations.push({
        range: new monaco.Range(row.rightNo, 1, row.rightNo, 1),
        options: {
          isWholeLine: true,
          className: "patch-line--add",
          linesDecorationsClassName: "patch-gutter--add",
        },
      });
    }
    if (row.type === "remove" && row.leftNo != null) {
      decorations.push({
        range: new monaco.Range(row.leftNo, 1, row.leftNo, 1),
        options: {
          isWholeLine: true,
          className: "patch-line--remove",
          linesDecorationsClassName: "patch-gutter--remove",
        },
      });
    }
  }

  collection.set(decorations);

  const anchorLine = firstPatchChangeLine(review.before, review.after);
  const domNode = document.createElement("div");
  domNode.className = "patch-gutter-widget";

  const acceptBtn = document.createElement("button");
  acceptBtn.type = "button";
  acceptBtn.className = "patch-gutter-widget__accept";
  acceptBtn.textContent = "Accept";
  acceptBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    review.onAccept();
  });

  const rejectBtn = document.createElement("button");
  rejectBtn.type = "button";
  rejectBtn.className = "patch-gutter-widget__reject";
  rejectBtn.textContent = "Reject";
  rejectBtn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    review.onReject();
  });

  domNode.append(acceptBtn, rejectBtn);

  widget = {
    getId: () => "patch-review-widget",
    getDomNode: () => domNode,
    getPosition: () => ({
      position: { lineNumber: anchorLine, column: 1 },
      preference: [monaco.editor.ContentWidgetPositionPreference.EXACT],
    }),
  };
  editorInstance.addContentWidget(widget);
  editorInstance.updateOptions({ glyphMargin: true });

  return {
    dispose: () => {
      collection.clear();
      disposeWidget();
      editorInstance.updateOptions({ glyphMargin: false });
    },
  };
}
