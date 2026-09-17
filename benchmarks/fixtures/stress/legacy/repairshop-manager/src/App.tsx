import { useEffect, useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Customers } from "./pages/Customers";
import { Vehicles } from "./pages/Vehicles";
import { WorkOrders } from "./pages/WorkOrders";
import { Estimates } from "./pages/Estimates";
import { Invoices } from "./pages/Invoices";
import { Technicians } from "./pages/Technicians";
import { PartsInventory } from "./pages/PartsInventory";
import { ServiceHistory } from "./pages/ServiceHistory";

const PAGES = [
  { id: "dashboard", title: "Dashboard", Page: Dashboard },
  { id: "customers", title: "Customers", Page: Customers },
  { id: "vehicles", title: "Vehicles", Page: Vehicles },
  { id: "work-orders", title: "Work Orders", Page: WorkOrders },
  { id: "estimates", title: "Estimates", Page: Estimates },
  { id: "invoices", title: "Invoices", Page: Invoices },
  { id: "technicians", title: "Technicians", Page: Technicians },
  { id: "parts-inventory", title: "Parts Inventory", Page: PartsInventory },
  { id: "service-history", title: "Service History", Page: ServiceHistory },
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
      <h1>RepairShop Manager</h1>
      <p>RepairShop deterministic stress scaffold.</p>
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
