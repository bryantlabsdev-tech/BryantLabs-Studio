import { useEffect, useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Products } from "./pages/Products";
import { Suppliers } from "./pages/Suppliers";
import { PurchaseOrders } from "./pages/PurchaseOrders";
import { StockMovements } from "./pages/StockMovements";
import { Alerts } from "./pages/Alerts";
import { Reports } from "./pages/Reports";
import { Settings } from "./pages/Settings";

const PAGES = [
  { id: "dashboard", title: "Dashboard", Page: Dashboard },
  { id: "products", title: "Products", Page: Products },
  { id: "suppliers", title: "Suppliers", Page: Suppliers },
  { id: "purchase-orders", title: "Purchase Orders", Page: PurchaseOrders },
  { id: "stock-movements", title: "Stock Movements", Page: StockMovements },
  { id: "alerts", title: "Alerts", Page: Alerts },
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
      <h1>Inventory Command Center</h1>
      <p>Inventory deterministic stress scaffold.</p>
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
