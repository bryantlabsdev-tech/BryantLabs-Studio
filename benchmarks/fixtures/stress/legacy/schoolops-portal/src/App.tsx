import { useEffect, useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Students } from "./pages/Students";
import { Teachers } from "./pages/Teachers";
import { Classes } from "./pages/Classes";
import { Attendance } from "./pages/Attendance";
import { Grades } from "./pages/Grades";
import { BehaviorLogs } from "./pages/BehaviorLogs";
import { ParentContacts } from "./pages/ParentContacts";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";

const PAGES = [
  { id: "dashboard", title: "Dashboard", Page: Dashboard },
  { id: "students", title: "Students", Page: Students },
  { id: "teachers", title: "Teachers", Page: Teachers },
  { id: "classes", title: "Classes", Page: Classes },
  { id: "attendance", title: "Attendance", Page: Attendance },
  { id: "grades", title: "Grades", Page: Grades },
  { id: "behavior-logs", title: "Behavior Logs", Page: BehaviorLogs },
  { id: "parent-contacts", title: "Parent Contacts", Page: ParentContacts },
  { id: "reports", title: "Reports", Page: Reports },
  { id: "settings", title: "Settings", Page: Settings },
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
      <h1>SchoolOps Portal</h1>
      <p>SchoolOps deterministic stress scaffold.</p>
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
