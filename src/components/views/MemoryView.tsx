import { useCallback, useMemo, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import { EmptyState } from "@/components/EmptyState";
import type { MemoryTimelineEntry } from "@/core/sessionMemory/types";
import type { ProjectMemory } from "@/core/projectMemory/types";
import {
  MEMORY_CATEGORIES,
  MEMORY_CATEGORY_LABELS,
  type AgentMemoryRecord,
  type MemoryCategory,
  type MemoryRecordInput,
} from "@/core/memory/types";

const KIND_LABEL: Record<MemoryTimelineEntry["kind"], string> = {
  prompt: "Prompt",
  plan: "Plan",
  ai_plan: "AI plan",
  files_modified: "Files modified",
  verification_failure: "Failure",
  auto_fix: "Auto Fix",
};

type FilterMode = "all" | MemoryCategory | "pinned" | "archived";

export function MemoryView() {
  const {
    project,
    sessionMemory,
    sessionMemoryDiagnostics,
    projectMemory,
    projectMemoryError,
    saveProjectMemory,
    clearSessionMemory,
    clearPromptHistory,
    clearFailureHistory,
    agentMemoryStore,
    memoryAnalytics,
    addAgentMemoryRecord,
    updateAgentMemoryRecord,
    deleteAgentMemoryRecord,
    setAgentMemoryAutoSave,
    exportAgentMemoryJson,
    importAgentMemoryJson,
  } = useWorkspace();

  const [draft, setDraft] = useState<ProjectMemory>(projectMemory);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [filter, setFilter] = useState<FilterMode>("all");
  const [search, setSearch] = useState("");
  const [editor, setEditor] = useState<MemoryRecordInput | null>(null);
  const [importText, setImportText] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const filteredMemories = useMemo(() => {
    const q = search.trim().toLowerCase();
    return agentMemoryStore.memories.filter((m) => {
      if (filter === "pinned" && !m.pinned) return false;
      if (filter === "archived" && !m.archived) return false;
      if (filter !== "all" && filter !== "pinned" && filter !== "archived") {
        if (m.category !== filter) return false;
      }
      if (filter !== "archived" && m.archived) return false;
      if (!q) return true;
      return `${m.title} ${m.content} ${m.tags.join(" ")}`.toLowerCase().includes(q);
    });
  }, [agentMemoryStore.memories, filter, search]);

  const updateField = useCallback(
    (
      field: keyof Pick<
        ProjectMemory,
        "projectName" | "architecture" | "userPreferences" | "notes"
      >,
      value: string,
    ) => {
      setDraft((prev) => ({ ...prev, [field]: value }));
      setDirty(true);
    },
    [],
  );

  const handleSaveProject = useCallback(async () => {
    setSaving(true);
    try {
      await saveProjectMemory({
        projectName: draft.projectName,
        architecture: draft.architecture,
        userPreferences: draft.userPreferences,
        notes: draft.notes,
      });
      setDirty(false);
    } finally {
      setSaving(false);
    }
  }, [draft, saveProjectMemory]);

  const saveEditor = useCallback(async () => {
    if (!editor?.title.trim() && !editor?.content.trim()) return;
    await addAgentMemoryRecord(editor);
    setEditor(null);
    setNote("Memory saved.");
  }, [addAgentMemoryRecord, editor]);

  const handleExport = useCallback(async () => {
    const json = exportAgentMemoryJson();
    try {
      await navigator.clipboard.writeText(json);
      setNote("Memory export copied to clipboard.");
    } catch {
      setNote("Export ready — copy failed, use download.");
    }
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "bryantlabs-agent-memory.json";
    a.click();
    URL.revokeObjectURL(url);
  }, [exportAgentMemoryJson]);

  const handleImport = useCallback(async () => {
    if (!importText.trim()) return;
    await importAgentMemoryJson(importText);
    setImportText("");
    setNote("Memory imported.");
  }, [importAgentMemoryJson, importText]);

  if (!project) {
    return (
      <EmptyState
        title="No project open"
        description="Open a project to manage persistent agent memory."
      />
    );
  }

  const mem = sessionMemory;
  const timeline = [...mem.timeline].reverse();

  return (
    <div className="memory">
      <header className="memory__head">
        <h3 className="memory__title">Memory Manager</h3>
        <p className="plan__muted">
          Long-term memory in <code>.bryantlabs/agent-memory.json</code> · legacy notes in{" "}
          <code>project-memory.json</code>
        </p>
      </header>

      <section className="memory__section memory__analytics glass-panel">
        <h4 className="memory__heading">Memory analytics</h4>
        <dl className="memory__stats">
          <dt>Total memories</dt>
          <dd>{memoryAnalytics.totalMemories}</dd>
          <dt>Active</dt>
          <dd>{memoryAnalytics.activeMemories}</dd>
          <dt>Retrieval count</dt>
          <dd>{memoryAnalytics.retrievalCount}</dd>
          <dt>Hit rate</dt>
          <dd>
            {memoryAnalytics.hitRatePercent != null
              ? `${memoryAnalytics.hitRatePercent}%`
              : "—"}
          </dd>
          <dt>Pinned</dt>
          <dd>{memoryAnalytics.pinnedCount}</dd>
        </dl>
        <label className="memory__toggle">
          <input
            type="checkbox"
            checked={agentMemoryStore.settings.autoSaveSuccessfulMemories}
            onChange={(e) => void setAgentMemoryAutoSave(e.target.checked)}
          />
          Auto-save successful memories
        </label>
      </section>

      <section className="memory__section">
        <div className="memory__toolbar">
          <input
            className="search__input"
            type="search"
            placeholder="Search memories…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="prov-input"
            value={filter}
            onChange={(e) => setFilter(e.target.value as FilterMode)}
          >
            <option value="all">All categories</option>
            {MEMORY_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {MEMORY_CATEGORY_LABELS[cat]}
              </option>
            ))}
            <option value="pinned">Pinned</option>
            <option value="archived">Archived</option>
          </select>
          <button
            type="button"
            className="prov-btn prov-btn--primary"
            onClick={() =>
              setEditor({
                category: filter === "all" || filter === "pinned" || filter === "archived"
                  ? "project"
                  : filter,
                title: "",
                content: "",
              })
            }
          >
            New memory
          </button>
          <button type="button" className="prov-btn" onClick={() => void handleExport()}>
            Export
          </button>
        </div>

        {editor ? (
          <div className="memory__editor glass-panel">
            <label className="memory__field">
              <span className="memory__field-label">Category</span>
              <select
                className="prov-input"
                value={editor.category}
                onChange={(e) =>
                  setEditor({ ...editor, category: e.target.value as MemoryCategory })
                }
              >
                {MEMORY_CATEGORIES.map((cat) => (
                  <option key={cat} value={cat}>
                    {MEMORY_CATEGORY_LABELS[cat]}
                  </option>
                ))}
              </select>
            </label>
            <label className="memory__field">
              <span className="memory__field-label">Title</span>
              <input
                className="search__input"
                value={editor.title}
                onChange={(e) => setEditor({ ...editor, title: e.target.value })}
              />
            </label>
            <label className="memory__field">
              <span className="memory__field-label">Content</span>
              <textarea
                className="memory__textarea"
                rows={4}
                value={editor.content}
                onChange={(e) => setEditor({ ...editor, content: e.target.value })}
              />
            </label>
            <div className="memory__controls">
              <button type="button" className="prov-btn prov-btn--primary" onClick={() => void saveEditor()}>
                Save memory
              </button>
              <button type="button" className="prov-btn" onClick={() => setEditor(null)}>
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        <ul className="memory__record-list">
          {filteredMemories.length === 0 ? (
            <li className="plan__muted">No memories match this filter.</li>
          ) : (
            filteredMemories.map((record) => (
              <MemoryRecordRow
                key={record.id}
                record={record}
                onUpdate={updateAgentMemoryRecord}
                onDelete={deleteAgentMemoryRecord}
              />
            ))
          )}
        </ul>

        <details className="memory__import">
          <summary>Import memory JSON</summary>
          <textarea
            className="memory__textarea"
            rows={4}
            placeholder="Paste exported memory JSON…"
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
          />
          <button type="button" className="prov-btn" onClick={() => void handleImport()}>
            Import
          </button>
        </details>
      </section>

      <section className="memory__section memory__project">
        <h4 className="memory__heading">Legacy project fields</h4>
        <label className="memory__field">
          <span className="memory__field-label">Project name</span>
          <input
            className="search__input"
            type="text"
            spellCheck={false}
            value={draft.projectName}
            onChange={(e) => updateField("projectName", e.target.value)}
          />
        </label>
        <label className="memory__field">
          <span className="memory__field-label">Architecture</span>
          <textarea
            className="memory__textarea"
            rows={3}
            value={draft.architecture}
            onChange={(e) => updateField("architecture", e.target.value)}
          />
        </label>
        <label className="memory__field">
          <span className="memory__field-label">User preferences</span>
          <textarea
            className="memory__textarea"
            rows={2}
            value={draft.userPreferences}
            onChange={(e) => updateField("userPreferences", e.target.value)}
          />
        </label>
        <label className="memory__field">
          <span className="memory__field-label">Notes</span>
          <textarea
            className="memory__textarea"
            rows={3}
            value={draft.notes}
            onChange={(e) => updateField("notes", e.target.value)}
          />
        </label>
        <div className="memory__controls">
          <button
            type="button"
            className="prov-btn prov-btn--primary"
            disabled={!dirty || saving}
            onClick={() => void handleSaveProject()}
          >
            {saving ? "Saving…" : "Save project fields"}
          </button>
        </div>
        {projectMemoryError ? <p className="memory__error">{projectMemoryError}</p> : null}
      </section>

      <section className="memory__section">
        <h4 className="memory__heading">Session memory (this run)</h4>
        {sessionMemoryDiagnostics?.used ? (
          <p className="memory__diag-line">
            Session memory active for follow-up prompts.
          </p>
        ) : (
          <p className="plan__muted">Session memory expands follow-up prompts within this session.</p>
        )}
        <div className="memory__controls">
          <button type="button" className="prov-btn" onClick={clearPromptHistory}>
            Clear prompts
          </button>
          <button type="button" className="prov-btn" onClick={clearFailureHistory}>
            Clear failures
          </button>
          <button type="button" className="prov-btn" onClick={clearSessionMemory}>
            Clear session
          </button>
        </div>
        <ul className="memory__timeline">
          {timeline.slice(0, 24).map((entry) => (
            <li key={entry.id} className="memory__entry">
              <span className="memory__entry-kind">{KIND_LABEL[entry.kind]}</span>
              <span className="memory__entry-time">
                {new Date(entry.at).toLocaleString()}
              </span>
              <span className="memory__entry-title">{entry.title}</span>
            </li>
          ))}
        </ul>
      </section>

      {note ? <p className="plan__muted">{note}</p> : null}
    </div>
  );
}

function MemoryRecordRow({
  record,
  onUpdate,
  onDelete,
}: {
  record: AgentMemoryRecord;
  onUpdate: (
    id: string,
    patch: Partial<Pick<AgentMemoryRecord, "title" | "content" | "pinned" | "archived">>,
  ) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}) {
  return (
    <li className="memory__record glass-panel">
      <div className="memory__record-head">
        <span className="memory-suggest__badge">
          {MEMORY_CATEGORY_LABELS[record.category]}
        </span>
        {record.pinned ? <span className="memory__pin">Pinned</span> : null}
        {record.archived ? <span className="memory__archived">Archived</span> : null}
        <strong>{record.title}</strong>
        <span className="plan__muted">
          used {record.usageCount} · success {record.successCount}
        </span>
      </div>
      <p className="memory__record-body">{record.content}</p>
      <div className="memory__controls">
        <button
          type="button"
          className="prov-btn"
          onClick={() => void onUpdate(record.id, { pinned: !record.pinned })}
        >
          {record.pinned ? "Unpin" : "Pin"}
        </button>
        <button
          type="button"
          className="prov-btn"
          onClick={() => void onUpdate(record.id, { archived: !record.archived })}
        >
          {record.archived ? "Unarchive" : "Archive"}
        </button>
        <button
          type="button"
          className="prov-btn"
          onClick={() => void onDelete(record.id)}
        >
          Delete
        </button>
      </div>
    </li>
  );
}
