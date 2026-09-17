import { useEffect, useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { MenuItems } from "./pages/MenuItems";
import { Tables } from "./pages/Tables";
import { Reservations } from "./pages/Reservations";
import { Orders } from "./pages/Orders";
import { KitchenQueue } from "./pages/KitchenQueue";
import { Staff } from "./pages/Staff";
import { Inventory } from "./pages/Inventory";
import { Reports } from "./pages/Reports";

const PAGES = [
  { id: "dashboard", title: "Dashboard", Page: Dashboard },
  { id: "menu-items", title: "Menu Items", Page: MenuItems },
  { id: "tables", title: "Tables", Page: Tables },
  { id: "reservations", title: "Reservations", Page: Reservations },
  { id: "orders", title: "Orders", Page: Orders },
  { id: "kitchen-queue", title: "Kitchen Queue", Page: KitchenQueue },
  { id: "staff", title: "Staff", Page: Staff },
  { id: "inventory", title: "Inventory", Page: Inventory },
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
      <h1>RestaurantOps</h1>
      <p>RestaurantOps deterministic stress scaffold.</p>
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
