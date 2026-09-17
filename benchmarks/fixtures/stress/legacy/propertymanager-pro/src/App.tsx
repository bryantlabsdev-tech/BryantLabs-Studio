import { useEffect, useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Units } from "./pages/Units";
import { Tenants } from "./pages/Tenants";
import { Leases } from "./pages/Leases";
import { RentPayments } from "./pages/RentPayments";
import { MaintenanceRequests } from "./pages/MaintenanceRequests";
import { Inspections } from "./pages/Inspections";
import { Notices } from "./pages/Notices";
import { Reports } from "./pages/Reports";

const PAGES = [
  { id: "dashboard", title: "Dashboard", Page: Dashboard },
  { id: "units", title: "Units", Page: Units },
  { id: "tenants", title: "Tenants", Page: Tenants },
  { id: "leases", title: "Leases", Page: Leases },
  { id: "rent-payments", title: "Rent Payments", Page: RentPayments },
  { id: "maintenance-requests", title: "Maintenance Requests", Page: MaintenanceRequests },
  { id: "inspections", title: "Inspections", Page: Inspections },
  { id: "notices", title: "Notices", Page: Notices },
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
      <h1>PropertyManager Pro</h1>
      <p>PropertyManager deterministic stress scaffold.</p>
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
