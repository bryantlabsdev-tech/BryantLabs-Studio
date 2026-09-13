import type { GeneratedFile } from "../greenfield/generate.cjs";

export const MOCK_FIELDFLOW_MULTIPAGE_FIXTURE_TOKEN =
  "BRYANTLABS_E2E_FIXTURE:fieldflow-multipage";

export const MOCK_FIELDFLOW_MULTIPAGE_FIXTURE_ENV_VALUE = "fieldflow-multipage";

export function isMockFieldFlowMultipageFixturePrompt(text: string): boolean {
  return text.includes(MOCK_FIELDFLOW_MULTIPAGE_FIXTURE_TOKEN);
}

export function isMockFieldFlowMultipageFixtureSelected(prompt: string): boolean {
  if (process.env.BRYANTLABS_E2E_GREENFIELD_FIXTURE === MOCK_FIELDFLOW_MULTIPAGE_FIXTURE_ENV_VALUE) {
    return true;
  }
  return isMockFieldFlowMultipageFixturePrompt(prompt);
}

const LOGO_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32" role="img" aria-label="FieldFlow">
  <rect width="32" height="32" rx="8" fill="#1d4ed8"/>
  <path d="M7 21c5-10 13-10 18 0" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round"/>
</svg>
`;

const PACKAGE_JSON = JSON.stringify(
  {
    name: "fieldflow",
    private: true,
    version: "0.0.0",
    type: "module",
    scripts: {
      dev: "vite",
      build: "tsc -p tsconfig.json && vite build",
      typecheck: "tsc -p tsconfig.json --noEmit",
      preview: "vite preview",
    },
    dependencies: {
      react: "^18.3.1",
      "react-dom": "^18.3.1",
      "react-router-dom": "^6.24.1",
    },
    devDependencies: {
      "@types/react": "^18.3.3",
      "@types/react-dom": "^18.3.0",
      "@types/react-router-dom": "^5.3.3",
      "@vitejs/plugin-react": "^5.0.0",
      typescript: "^5.4.5",
      vite: "^5.3.1",
    },
  },
  null,
  2,
);

const INDEX_HTML = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>FieldFlow</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
    <!-- ${MOCK_FIELDFLOW_MULTIPAGE_FIXTURE_TOKEN} -->
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;

const MAIN_TSX = `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
`;

const TSCONFIG = `{
  "compilerOptions": {
    "target": "ES2020",
    "lib": ["ES2020", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "skipLibCheck": true,
    "moduleResolution": "bundler",
    "isolatedModules": true,
    "noEmit": true,
    "jsx": "react-jsx",
    "strict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noFallthroughCasesInSwitch": true
  },
  "include": ["src", "vite.config.ts"]
}`;

const VITE_CONFIG = `import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
`;

const INDEX_CSS = `* { box-sizing: border-box; }
body {
  margin: 0;
  font-family: "Segoe UI", system-ui, sans-serif;
  background: #0f1419;
  color: #e6edf3;
}
img { max-width: 100%; height: auto; }
.ff-shell {
  display: grid;
  grid-template-columns: 220px 1fr;
  min-height: 100vh;
}
.ff-sidebar {
  min-width: 200px;
  width: 220px;
  min-height: 100vh;
  background: #161d27;
  border-right: 1px solid #243041;
  padding: 1.25rem 1rem;
}
.ff-brand {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 1.5rem;
  font-weight: 700;
}
.ff-brand img { width: 32px; height: 32px; }
.ff-nav { display: flex; flex-direction: column; gap: 0.35rem; }
.ff-nav a {
  color: #9fb0c3;
  text-decoration: none;
  padding: 0.55rem 0.7rem;
  border-radius: 8px;
  min-height: 36px;
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.ff-nav a.active, .ff-nav a:hover { background: #243041; color: #fff; }
.ff-main {
  min-height: 60vh;
  padding: 1.5rem;
}
.ff-page h1 { margin: 0 0 1rem; font-size: 1.75rem; }
.ff-kpis {
  display: grid;
  grid-template-columns: repeat(3, minmax(140px, 1fr));
  gap: 1rem;
  margin-bottom: 1.5rem;
}
.panel-card, .card, .widget, .dashboard-panel {
  min-width: 120px;
  min-height: 80px;
  display: block;
  background: #1b2430;
  border: 1px solid #2b3a4d;
  border-radius: 12px;
  padding: 1rem;
}
.ff-table { width: 100%; border-collapse: collapse; }
.ff-table th, .ff-table td { text-align: left; padding: 0.65rem 0.5rem; border-bottom: 1px solid #243041; }
.ff-badge {
  display: inline-block;
  border-radius: 999px;
  padding: 0.15rem 0.6rem;
  font-size: 0.75rem;
  background: #243041;
}
.ff-calendar {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 0.4rem;
}
.ff-day {
  min-height: 72px;
  background: #1b2430;
  border-radius: 8px;
  padding: 0.4rem;
  font-size: 0.8rem;
}
.ff-empty { opacity: 0.7; }
input, button, select {
  min-height: 36px;
  min-width: 36px;
  margin-top: 0.35rem;
  display: block;
}
@media (max-width: 800px) {
  .ff-shell { grid-template-columns: 1fr; }
  .ff-sidebar { width: 100%; min-height: auto; }
  .ff-kpis { grid-template-columns: 1fr; }
  .ff-calendar { grid-template-columns: repeat(2, 1fr); }
}
`;

const TYPES = `export type JobStatus = "scheduled" | "in_progress" | "complete";

export interface Job {
  id: string;
  title: string;
  clientName: string;
  status: JobStatus;
  scheduledFor: string;
  crew: string;
}

export interface Client {
  id: string;
  name: string;
  email: string;
  site: string;
}
`;

const USE_LOCAL_STORAGE = `import { useEffect, useState } from "react";

export function useLocalStorage<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = window.localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    window.localStorage.setItem(key, JSON.stringify(value));
  }, [key, value]);

  return [value, setValue];
}
`;

const SEED = `import type { Client, Job } from "../types";

export const SEED_JOBS: Job[] = [
  {
    id: "job-1",
    title: "Harbor Clinic roof repair",
    clientName: "Harbor Clinic",
    status: "in_progress",
    scheduledFor: "2026-09-15",
    crew: "Alpha",
  },
  {
    id: "job-2",
    title: "Riverside HVAC tune-up",
    clientName: "Riverside Offices",
    status: "scheduled",
    scheduledFor: "2026-09-18",
    crew: "Bravo",
  },
];

export const SEED_CLIENTS: Client[] = [
  { id: "client-1", name: "Harbor Clinic", email: "ops@harbor.example", site: "12 Bay St" },
  { id: "client-2", name: "Riverside Offices", email: "facilities@riverside.example", site: "88 River Rd" },
];
`;

const STATUS_BADGE = `import type { JobStatus } from "../../types";

export function StatusBadge({ status }: { status: JobStatus }) {
  const label =
    status === "in_progress" ? "In progress" : status === "complete" ? "Complete" : "Scheduled";
  return <span className="ff-badge">{label}</span>;
}
`;

const JOB_CARD = `import { Link } from "react-router-dom";
import type { Job } from "../../types";
import { StatusBadge } from "../ui/StatusBadge";

export function JobCard({ job }: { job: Job }) {
  return (
    <article className="panel-card">
      <h2>{job.title}</h2>
      <p>{job.clientName}</p>
      <StatusBadge status={job.status} />
      <p>
        <Link to={\`/jobs/\${job.id}\`}>Open job detail</Link>
      </p>
    </article>
  );
}
`;

const JOB_DETAIL = `import { Link, useParams } from "react-router-dom";
import { SEED_JOBS } from "../../data/seed";
import { StatusBadge } from "../ui/StatusBadge";

export default function JobDetail() {
  const { jobId } = useParams();
  const job = SEED_JOBS.find((item) => item.id === jobId);
  if (!job) {
    return (
      <section className="ff-page">
        <h1>Job not found</h1>
        <p className="ff-empty">No job matches {jobId}.</p>
        <Link to="/jobs">Back to jobs</Link>
      </section>
    );
  }
  return (
    <section className="ff-page">
      <p>
        <Link to="/jobs">Jobs</Link>
      </p>
      <h1>{job.title}</h1>
      <div className="panel-card">
        <p>Client: {job.clientName}</p>
        <p>Crew: {job.crew}</p>
        <p>Scheduled: {job.scheduledFor}</p>
        <StatusBadge status={job.status} />
      </div>
    </section>
  );
}
`;

const LAYOUT = `import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";

export function Layout() {
  return (
    <div className="ff-shell">
      <Sidebar />
      <main className="ff-main">
        <Outlet />
      </main>
    </div>
  );
}
`;

const SIDEBAR = `import { NavLink } from "react-router-dom";
import { Calendar, Home, Settings, Truck, Users } from "./IconStub";

const LINKS = [
  { to: "/", label: "Dashboard", icon: Home, end: true },
  { to: "/jobs", label: "Jobs", icon: Truck, end: false },
  { to: "/calendar", label: "Calendar", icon: Calendar, end: false },
  { to: "/clients", label: "Clients", icon: Users, end: false },
  { to: "/settings", label: "Settings", icon: Settings, end: false },
] as const;

export function Sidebar() {
  return (
    <aside className="ff-sidebar" aria-label="Primary">
      <div className="ff-brand">
        <img src="/logo.svg" alt="" width={32} height={32} />
        <span>FieldFlow</span>
      </div>
      <nav className="ff-nav" aria-label="Primary">
        {LINKS.map((link) => (
          <NavLink key={link.to} to={link.to} end={link.end}>
            <link.icon />
            {link.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
`;

const DASHBOARD = `import { SEED_JOBS } from "../data/seed";

export default function Dashboard() {
  const active = SEED_JOBS.filter((job) => job.status !== "complete").length;
  return (
    <section className="ff-page">
      <h1>FieldFlow Dashboard</h1>
      <div className="ff-kpis">
        <div className="panel-card">
          <p>Open jobs</p>
          <strong>{active}</strong>
        </div>
        <div className="panel-card">
          <p>Crews in field</p>
          <strong>2</strong>
        </div>
        <div className="panel-card">
          <p>Today's visits</p>
          <strong>{SEED_JOBS.length}</strong>
        </div>
      </div>
    </section>
  );
}
`;

const JOBS = `import { JobCard } from "../components/jobs/JobCard";
import { SEED_JOBS } from "../data/seed";

export default function Jobs() {
  return (
    <section className="ff-page">
      <h1>Jobs</h1>
      {SEED_JOBS.length === 0 ? (
        <p className="ff-empty">No jobs scheduled.</p>
      ) : (
        SEED_JOBS.map((job) => <JobCard key={job.id} job={job} />)
      )}
    </section>
  );
}
`;

const CALENDAR = `import { SEED_JOBS } from "../data/seed";

export default function Calendar() {
  const days = Array.from({ length: 21 }, (_, index) => index + 1);
  return (
    <section className="ff-page">
      <h1>Schedule</h1>
      <div className="ff-calendar" aria-label="Job calendar">
        {days.map((day) => {
          const jobs = SEED_JOBS.filter((job) => job.scheduledFor.endsWith(String(day).padStart(2, "0")));
          return (
            <div key={day} className="ff-day">
              <strong>{day}</strong>
              {jobs.map((job) => (
                <p key={job.id}>{job.title}</p>
              ))}
            </div>
          );
        })}
      </div>
    </section>
  );
}
`;

const CLIENTS = `import { SEED_CLIENTS } from "../data/seed";

export default function Clients() {
  return (
    <section className="ff-page">
      <h1>Clients</h1>
      {SEED_CLIENTS.map((client) => (
        <article key={client.id} className="panel-card">
          <h2>{client.name}</h2>
          <p>{client.email}</p>
          <p>{client.site}</p>
        </article>
      ))}
    </section>
  );
}
`;

const SETTINGS = `import { useLocalStorage } from "../hooks/useLocalStorage";

export default function Settings() {
  const [company, setCompany] = useLocalStorage("fieldflow-company", "FieldFlow Crews");
  return (
    <section className="ff-page">
      <h1>Settings</h1>
      <form
        className="panel-card"
        onSubmit={(event) => {
          event.preventDefault();
        }}
      >
        <label htmlFor="company-name">Company name</label>
        <input
          id="company-name"
          value={company}
          onChange={(event) => setCompany(event.target.value)}
        />
        <button type="submit">Save</button>
      </form>
    </section>
  );
}
`;

const APP = `import { Route, Routes } from "react-router-dom";
import { Layout } from "./components/Layout";
import JobDetail from "./components/jobs/JobDetail";
import Calendar from "./pages/Calendar";
import Clients from "./pages/Clients";
import Dashboard from "./pages/Dashboard";
import Jobs from "./pages/Jobs";
import Settings from "./pages/Settings";

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="jobs" element={<Jobs />} />
        <Route path="jobs/:jobId" element={<JobDetail />} />
        <Route path="calendar" element={<Calendar />} />
        <Route path="clients" element={<Clients />} />
        <Route path="settings" element={<Settings />} />
      </Route>
    </Routes>
  );
}
`;

export function buildMockFieldFlowFiles(): GeneratedFile[] {
  return [
    { path: "package.json", content: PACKAGE_JSON },
    { path: "index.html", content: INDEX_HTML },
    { path: "src/main.tsx", content: MAIN_TSX },
    { path: "tsconfig.json", content: TSCONFIG },
    { path: "vite.config.ts", content: VITE_CONFIG },
    { path: "src/index.css", content: INDEX_CSS },
    { path: "src/App.tsx", content: APP },
    { path: "src/types.ts", content: TYPES },
    { path: "src/hooks/useLocalStorage.ts", content: USE_LOCAL_STORAGE },
    { path: "src/data/seed.ts", content: SEED },
    { path: "src/components/Layout.tsx", content: LAYOUT },
    { path: "src/components/Sidebar.tsx", content: SIDEBAR },
    { path: "src/components/ui/StatusBadge.tsx", content: STATUS_BADGE },
    { path: "src/components/jobs/JobCard.tsx", content: JOB_CARD },
    { path: "src/components/jobs/JobDetail.tsx", content: JOB_DETAIL },
    { path: "src/pages/Dashboard.tsx", content: DASHBOARD },
    { path: "src/pages/Jobs.tsx", content: JOBS },
    { path: "src/pages/Calendar.tsx", content: CALENDAR },
    { path: "src/pages/Clients.tsx", content: CLIENTS },
    { path: "src/pages/Settings.tsx", content: SETTINGS },
    { path: "public/logo.svg", content: LOGO_SVG },
    { path: "public/favicon.svg", content: LOGO_SVG },
  ];
}
