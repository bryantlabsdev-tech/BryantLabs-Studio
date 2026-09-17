import { useEffect, useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Employees } from "./pages/Employees";
import { Departments } from "./pages/Departments";
import { Onboarding } from "./pages/Onboarding";
import { TimeOff } from "./pages/TimeOff";
import { PerformanceReviews } from "./pages/PerformanceReviews";
import { PayrollSummary } from "./pages/PayrollSummary";
import { Documents } from "./pages/Documents";
import { Reports } from "./pages/Reports";

const PAGES = [
  { id: "dashboard", title: "Dashboard", Page: Dashboard },
  { id: "employees", title: "Employees", Page: Employees },
  { id: "departments", title: "Departments", Page: Departments },
  { id: "onboarding", title: "Onboarding", Page: Onboarding },
  { id: "time-off", title: "Time Off", Page: TimeOff },
  { id: "performance-reviews", title: "Performance Reviews", Page: PerformanceReviews },
  { id: "payroll-summary", title: "Payroll Summary", Page: PayrollSummary },
  { id: "documents", title: "Documents", Page: Documents },
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
      <h1>HR Command Center</h1>
      <p>HR Command deterministic stress scaffold.</p>
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
