import { useEffect, useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Events } from "./pages/Events";
import { Venues } from "./pages/Venues";
import { Vendors } from "./pages/Vendors";
import { Budgets } from "./pages/Budgets";
import { Tasks } from "./pages/Tasks";
import { Guests } from "./pages/Guests";
import { Schedules } from "./pages/Schedules";
import { Reports } from "./pages/Reports";

const PAGES = [
  { id: "dashboard", title: "Dashboard", Page: Dashboard },
  { id: "events", title: "Events", Page: Events },
  { id: "venues", title: "Venues", Page: Venues },
  { id: "vendors", title: "Vendors", Page: Vendors },
  { id: "budgets", title: "Budgets", Page: Budgets },
  { id: "tasks", title: "Tasks", Page: Tasks },
  { id: "guests", title: "Guests", Page: Guests },
  { id: "schedules", title: "Schedules", Page: Schedules },
  { id: "reports", title: "Reports", Page: Reports },
] as const;

type PageId = (typeof PAGES)[number]["id"];

export default function App() {
  const [route, setRoute] = useState<PageId>(PAGES[0].id);

  useEffect(() => {
    const sync = () => {
      const hash = window.location.hash.replace(/^#\/?/, "");
      const match = PAGES.find((page) => page.id === hash);
      setRoute(match?.id ?? PAGES[0].id);
    };
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, []);

  const current = PAGES.find((page) => page.id === route) ?? PAGES[0];
  const Page = current.Page;

  return (
    <main>
      <h1>EventOps Planner</h1>
      <p>EventOps deterministic stress scaffold.</p>
      <nav>
        {PAGES.map((page) => (
          <a href={"#/" + page.id} key={page.id}>
            {page.title}
          </a>
        ))}
      </nav>
      <Page />
    </main>
  );
}
