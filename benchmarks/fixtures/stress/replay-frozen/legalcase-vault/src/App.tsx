import { useEffect, useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Clients } from "./pages/Clients";
import { Cases } from "./pages/Cases";
import { Evidence } from "./pages/Evidence";
import { Documents } from "./pages/Documents";
import { Deadlines } from "./pages/Deadlines";
import { Hearings } from "./pages/Hearings";
import { Notes } from "./pages/Notes";
import { Reports } from "./pages/Reports";

const PAGES = [
  { id: "dashboard", title: "Dashboard", Page: Dashboard },
  { id: "clients", title: "Clients", Page: Clients },
  { id: "cases", title: "Cases", Page: Cases },
  { id: "evidence", title: "Evidence", Page: Evidence },
  { id: "documents", title: "Documents", Page: Documents },
  { id: "deadlines", title: "Deadlines", Page: Deadlines },
  { id: "hearings", title: "Hearings", Page: Hearings },
  { id: "notes", title: "Notes", Page: Notes },
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
      <h1>LegalCase Vault</h1>
      <p>LegalCase deterministic stress scaffold.</p>
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
