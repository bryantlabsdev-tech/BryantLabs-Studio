import { useState } from "react";
import { ExplorerView } from "@/components/views/ExplorerView";
import { SearchView } from "@/components/views/SearchView";
import { OverviewView } from "@/components/views/OverviewView";
import { PlanComposerView } from "@/components/views/PlanComposerView";
import { NewAppView } from "@/components/views/NewAppView";

type SidebarTab = "files" | "search" | "overview" | "plan" | "newapp";

const TABS: ReadonlyArray<{ id: SidebarTab; label: string }> = [
  { id: "newapp", label: "New App" },
  { id: "files", label: "Files" },
  { id: "search", label: "Search" },
  { id: "overview", label: "Overview" },
  { id: "plan", label: "Plan" },
];

/**
 * Left column. A tabbed sidebar hosting the file Explorer, global Search, and
 * the Project Overview. All three are strictly read-only views.
 */
export function Sidebar() {
  const [tab, setTab] = useState<SidebarTab>("files");

  return (
    <section className="panel panel--sidebar" aria-label="Sidebar">
      <header className="sidebar__tabs" role="tablist">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            className={`sidebar__tab${tab === id ? " sidebar__tab--active" : ""}`}
            onClick={() => setTab(id)}
          >
            {label}
          </button>
        ))}
      </header>
      <div className="panel__body sidebar__body">
        {tab === "newapp" ? (
          <NewAppView />
        ) : tab === "files" ? (
          <ExplorerView />
        ) : tab === "search" ? (
          <SearchView />
        ) : tab === "overview" ? (
          <OverviewView />
        ) : (
          <PlanComposerView />
        )}
      </div>
    </section>
  );
}
