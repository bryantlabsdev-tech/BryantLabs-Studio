import { useEffect, useState } from "react";
import { Dashboard } from "./pages/Dashboard";
import { Patients } from "./pages/Patients";
import { Appointments } from "./pages/Appointments";
import { Prescriptions } from "./pages/Prescriptions";
import { Providers } from "./pages/Providers";
import { Billing } from "./pages/Billing";
import { VisitNotes } from "./pages/VisitNotes";
import { Reports } from "./pages/Reports";

const PAGES = [
  { id: "dashboard", title: "Dashboard", Page: Dashboard },
  { id: "patients", title: "Patients", Page: Patients },
  { id: "appointments", title: "Appointments", Page: Appointments },
  { id: "prescriptions", title: "Prescriptions", Page: Prescriptions },
  { id: "providers", title: "Providers", Page: Providers },
  { id: "billing", title: "Billing", Page: Billing },
  { id: "visit-notes", title: "Visit Notes", Page: VisitNotes },
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
      <h1>MedTrack Clinic</h1>
      <p>MedTrack deterministic stress scaffold.</p>
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
