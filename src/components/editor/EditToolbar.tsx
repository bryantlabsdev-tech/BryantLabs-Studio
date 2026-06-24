import { useState } from "react";
import type { EditKind } from "@/core/editor";
import { useWorkspace } from "@/app/WorkspaceProvider";

const KINDS: ReadonlyArray<{ id: EditKind; label: string }> = [
  { id: "prepend-comment", label: "Add comment at top" },
  { id: "replace-text", label: "Replace exact text" },
  { id: "append-note", label: "Append note at end" },
];

/**
 * Deterministic edit controls + the approval workflow:
 * Propose → Review → Apply, plus Undo. Apply is disabled until the patch has
 * been reviewed, enforcing explicit user approval before any write.
 */
export function EditToolbar() {
  const {
    pendingPatch,
    reviewing,
    editStatus,
    editError,
    canUndo,
    proposeEdit,
    reviewPatch,
    discardPatch,
    applyPatch,
    undoLastEdit,
  } = useWorkspace();

  const [kind, setKind] = useState<EditKind>("prepend-comment");
  const [comment, setComment] = useState("");
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [note, setNote] = useState("");

  const applying = editStatus === "applying";

  const requiredFilled =
    kind === "prepend-comment"
      ? comment.trim() !== ""
      : kind === "replace-text"
        ? find !== ""
        : note.trim() !== "";

  const changeKind = (next: EditKind) => {
    setKind(next);
    discardPatch();
  };

  const propose = () =>
    proposeEdit(kind, { comment, find, replace, note });

  return (
    <div className="edit-toolbar">
      <div className="edit-toolbar__row">
        <select
          className="edit-toolbar__kind"
          value={kind}
          onChange={(e) => changeKind(e.target.value as EditKind)}
        >
          {KINDS.map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>

        {kind === "prepend-comment" ? (
          <input
            className="edit-toolbar__input"
            placeholder="Comment text"
            value={comment}
            spellCheck={false}
            onChange={(e) => setComment(e.target.value)}
          />
        ) : null}

        {kind === "replace-text" ? (
          <>
            <input
              className="edit-toolbar__input"
              placeholder="Find exact text"
              value={find}
              spellCheck={false}
              onChange={(e) => setFind(e.target.value)}
            />
            <input
              className="edit-toolbar__input"
              placeholder="Replace with"
              value={replace}
              spellCheck={false}
              onChange={(e) => setReplace(e.target.value)}
            />
          </>
        ) : null}

        {kind === "append-note" ? (
          <input
            className="edit-toolbar__input"
            placeholder="Note text"
            value={note}
            spellCheck={false}
            onChange={(e) => setNote(e.target.value)}
          />
        ) : null}
      </div>

      <div className="edit-toolbar__row edit-toolbar__actions">
        <button
          type="button"
          className="btn"
          disabled={!requiredFilled || applying}
          onClick={propose}
        >
          Propose Edit
        </button>
        <button
          type="button"
          className="btn"
          disabled={!pendingPatch || reviewing}
          onClick={reviewPatch}
        >
          Review Patch
        </button>
        <button
          type="button"
          className="btn btn--primary"
          disabled={!pendingPatch || !reviewing || applying}
          onClick={() => void applyPatch()}
        >
          {applying ? "Applying…" : "Apply Patch"}
        </button>
        {pendingPatch ? (
          <button type="button" className="btn btn--ghost" onClick={discardPatch}>
            Discard
          </button>
        ) : null}
        <button
          type="button"
          className="btn btn--ghost edit-toolbar__undo"
          disabled={!canUndo || applying}
          onClick={() => void undoLastEdit()}
        >
          Undo Last Edit
        </button>
      </div>

      {editError ? (
        <p className="edit-toolbar__msg edit-toolbar__msg--error">{editError}</p>
      ) : pendingPatch && !reviewing ? (
        <p className="edit-toolbar__msg">
          Patch ready. Click <strong>Review Patch</strong> to inspect the diff
          before applying.
        </p>
      ) : pendingPatch && reviewing ? (
        <p className="edit-toolbar__msg">
          Review the diff below, then <strong>Apply Patch</strong> to write the
          change.
        </p>
      ) : editStatus === "applied" ? (
        <p className="edit-toolbar__msg edit-toolbar__msg--ok">
          Edit applied and verified. You can Undo Last Edit.
        </p>
      ) : null}
    </div>
  );
}
