import { useEffect, useMemo, useRef, useState } from "react";
import { useWorkspace } from "@/app/WorkspaceProvider";
import {
  readFollowUpReviewFirst,
  writeFollowUpReviewFirst,
} from "@/core/build/followUpPrefs";
import type { CenterTab, RailTool } from "@/core/layout/types";

interface CommandItem {
  readonly id: string;
  readonly label: string;
  readonly hint?: string;
  readonly section: "daily" | "advanced";
  readonly run: () => void;
}

export function CommandPalette() {
  const {
    commandPaletteOpen,
    setCommandPaletteOpen,
    setRailTool,
    setCenterTab,
    setDockTab,
    openDeveloperConsole,
    openDock,
    toggleDock,
    runVerification,
    triggerGreenfieldRepair,
    greenfieldRun,
  } = useWorkspace();
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  const commands = useMemo((): CommandItem[] => {
    const go = (tool: RailTool, label: string, hint?: string): CommandItem => ({
      id: `rail:${tool}`,
      label,
      section: "advanced",
      ...(hint ? { hint } : {}),
      run: () => setRailTool(tool),
    });
    const tab = (id: CenterTab, label: string, hint?: string): CommandItem => ({
      id: `tab:${id}`,
      label,
      section: "daily",
      ...(hint ? { hint } : {}),
      run: () => setCenterTab(id),
    });
    return [
      tab("preview", "Open Preview"),
      tab("diff", "Open Diff"),
      tab("studioLog", "Open Studio Log"),
      tab("summary", "Open Summary"),
      {
        id: "runs:search",
        label: "Search runs",
        hint: "Focus run history search",
        section: "daily",
        run: () => {
          setRailTool("agent");
          window.dispatchEvent(new CustomEvent("bryantlabs:focus-run-search"));
        },
      },
      {
        id: "greenfield:repair",
        label: "Run repair",
        hint: "Fix TypeScript/build after greenfield setup",
        section: "daily",
        run: () => void triggerGreenfieldRepair(),
      },
      {
        id: "review:toggle",
        label: readFollowUpReviewFirst() ? "Turn off review first" : "Turn on review first",
        hint: "Pause to review diffs before applying",
        section: "daily",
        run: () => {
          const next = !readFollowUpReviewFirst();
          writeFollowUpReviewFirst(next);
          window.dispatchEvent(new CustomEvent("bryantlabs:toggle-review-first"));
        },
      },
      go("providers", "Open Settings", "AI providers & API keys"),
      {
        id: "dock:terminal",
        label: "Open Terminal",
        section: "daily",
        run: () => {
          openDock();
          setDockTab("terminal");
        },
      },
      {
        id: "dock:toggle",
        label: "Toggle Terminal Dock",
        section: "daily",
        run: () => toggleDock(),
      },
      {
        id: "verify",
        label: "Run Verification",
        section: "daily",
        run: () => void runVerification(),
      },
      {
        id: "dev:console",
        label: "Developer Console",
        hint: "Execution observability",
        section: "advanced",
        run: () => openDeveloperConsole(),
      },
      go("files", "Files", "Project explorer"),
      go("search", "Search", "Search in project"),
      go("plan", "Plan", "Manual plan composer"),
      go("pipeline", "Pipeline", "Multi-agent pipeline"),
      go("execution", "Execution", "Multi-file execution"),
      go("insights", "Insights", "Project insights"),
      go("memory", "Memory", "Agent memory"),
      go("context", "Context Inspector"),
      go("repomap", "Repo map", "Hub files, symbols, and file drill-down"),
      go("repository", "Repository"),
      go("builder", "Autonomous Builder"),
      go("agent", "Autonomous Agent"),
      tab("editor", "Open Editor", undefined),
      tab("execution", "Open Execution Dashboard", undefined),
    ];
  }, [
    setRailTool,
    setCenterTab,
    openDeveloperConsole,
    openDock,
    toggleDock,
    setDockTab,
    runVerification,
    triggerGreenfieldRepair,
    greenfieldRun.setupStatus,
  ]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return commands.filter((command) => command.section === "daily");
    }
    return commands.filter(
      (c) =>
        c.label.toLowerCase().includes(q) ||
        c.hint?.toLowerCase().includes(q) ||
        c.id.toLowerCase().includes(q),
    );
  }, [commands, query]);

  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    if (!commandPaletteOpen) return;
    setQuery("");
    setActiveIdx(0);
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [commandPaletteOpen]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  useEffect(() => {
    if (!commandPaletteOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        setCommandPaletteOpen(false);
        return;
      }
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActiveIdx((i) => Math.min(i + 1, Math.max(0, filtered.length - 1)));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActiveIdx((i) => Math.max(i - 1, 0));
        return;
      }
      if (e.key === "Enter" && filtered[activeIdx]) {
        e.preventDefault();
        filtered[activeIdx].run();
        setCommandPaletteOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [commandPaletteOpen, filtered, activeIdx, setCommandPaletteOpen]);

  if (!commandPaletteOpen) return null;

  return (
    <div
      className="command-palette-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      data-testid="command-palette"
      onClick={() => setCommandPaletteOpen(false)}
    >
      <div
        className="command-palette"
        onClick={(event) => event.stopPropagation()}
      >
        <input
          ref={inputRef}
          className="command-palette__input"
          type="search"
          placeholder="Type a command…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          aria-controls="command-palette-list"
          aria-activedescendant={
            filtered[activeIdx] ? `command-palette-item-${activeIdx}` : undefined
          }
        />
        <ul id="command-palette-list" className="command-palette__list" role="listbox">
          {filtered.length === 0 ? (
            <li className="command-palette__empty">No matching commands.</li>
          ) : (
            filtered.map((cmd, idx) => (
              <li key={cmd.id} role="presentation">
                <button
                  id={`command-palette-item-${idx}`}
                  type="button"
                  role="option"
                  aria-selected={idx === activeIdx}
                  className={[
                    "command-palette__item",
                    idx === activeIdx ? "command-palette__item--on" : "",
                  ]
                    .filter(Boolean)
                    .join(" ")}
                  onMouseEnter={() => setActiveIdx(idx)}
                  onClick={() => {
                    cmd.run();
                    setCommandPaletteOpen(false);
                  }}
                >
                  <span className="command-palette__label">{cmd.label}</span>
                  {cmd.hint ? (
                    <span className="command-palette__hint plan__muted">{cmd.hint}</span>
                  ) : null}
                </button>
              </li>
            ))
          )}
        </ul>
        {!query.trim() ? (
          <p className="command-palette__footer plan__muted">
            Type to search advanced commands (Plan, Pipeline, Builder…)
          </p>
        ) : null}
      </div>
    </div>
  );
}
