import { useEffect, useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Vehicles } from "./pages/Vehicles";
import { Drivers } from "./pages/Drivers";
import { Dispatch } from "./pages/Dispatch";
import { Maintenance } from "./pages/Maintenance";
import { FuelLogs } from "./pages/FuelLogs";
import { Inspections } from "./pages/Inspections";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";

const PAGES = [
  { id: "dashboard", title: "Dashboard", Page: Dashboard },
  { id: "vehicles", title: "Vehicles", Page: Vehicles },
  { id: "drivers", title: "Drivers", Page: Drivers },
  { id: "dispatch", title: "Dispatch", Page: Dispatch },
  { id: "maintenance", title: "Maintenance", Page: Maintenance },
  { id: "fuel-logs", title: "Fuel Logs", Page: FuelLogs },
  { id: "inspections", title: "Inspections", Page: Inspections },
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
      <h1>FleetOps Pro</h1>
      <p>FleetOps deterministic stress scaffold.</p>
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
