import type { RunFileDiff } from "@/core/agent/runFileDiffs";

/** Specification text consumed by requirement extraction. Labels must remain extractable. */
export const FIELD_FLOW_EXTRACTION_PROMPT = `Build a FieldFlow CRM app.

Pages:
- Dashboard
- Customers
- Settings

Job statuses: Scheduled, In Progress, Complete, Cancelled
Invoice statuses: Draft, Sent, Paid, Overdue
Lead statuses: New, Contacted, Qualified, Lost

Dashboard KPIs: New Leads, Active Jobs, Open Estimates, Unpaid Invoices, Monthly Revenue

Also include:
- React Router for navigation
- localStorage persistence

Clean reusable components
Visual polish
Self-audit checklist
`;

export const FIELD_FLOW_FULL_PROMPT = `${FIELD_FLOW_EXTRACTION_PROMPT}
Tailwind CSS
Lucide icons
Modern dark SaaS dashboard
Mobile responsive layout
Recent activity feed
Tables with mock data
Check routing works
Check CRUD buttons
Return summary of files changed and known limitations
`;

function diff(path: string, after: string): RunFileDiff {
  const linesAdded = after.split(/\n/).length;
  return {
    path,
    linesAdded,
    linesRemoved: 0,
    preview: [],
    before: "",
    after,
  };
}

export function fieldFlowGeneratedDiffs(): RunFileDiff[] {
  return [
    diff(
      "package.json",
      JSON.stringify(
        {
          name: "fieldflow-requirement-fixture",
          private: true,
          dependencies: {
            react: "^19.2.7",
            "react-dom": "^19.2.7",
            "react-router-dom": "^6.30.1",
            "lucide-react": "^0.511.0",
          },
          devDependencies: {
            tailwindcss: "^3.4.17",
          },
        },
        null,
        2,
      ),
    ),
    diff(
      "src/App.tsx",
      `import { useLayoutEffect } from "react";
import { NavLink, Route, Routes, BrowserRouter } from "react-router-dom";
import { LayoutDashboard } from "lucide-react";
import DashboardPage from "./pages/Dashboard";
import CustomersPage from "./pages/Customers";
import SettingsPage from "./pages/Settings";

const STORAGE_KEY = "fieldflow-session";

export default function App() {
  useLayoutEffect(() => {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ booted: true }));
  }, []);

  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-zinc-950 text-zinc-100">
        <nav className="sidebar w-56 p-4 bg-zinc-900">
          <p className="flex gap-2">
            <LayoutDashboard size={16} />
            FieldFlow
          </p>
          <NavLink to="/">Dashboard</NavLink>
          <NavLink to="/customers">Customers</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </nav>
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/customers" element={<CustomersPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}
`,
    ),
    diff(
      "src/pages/Dashboard.tsx",
      `const kpiCards = [
  { title: "New Leads", value: 4 },
  { title: "Active Jobs", value: 7 },
  { title: "Open Estimates", value: 2 },
  { title: "Unpaid Invoices", value: 1 },
  { title: "Monthly Revenue", value: 12800 },
];

export default function DashboardPage() {
  const activityFeed = [
    { id: "evt-1", detail: "Lead qualified" },
    { id: "evt-2", detail: "Invoice sent" },
  ];

  return (
    <section className="p-4 md:p-8 lg:grid lg:grid-cols-3 gap-4 rounded-xl shadow-lg bg-zinc-900">
      <h1>Dashboard</h1>
      {kpiCards.map((card) => (
        <article key={card.title} className="rounded-md bg-zinc-800 p-3">
          {card.title}: {card.value}
        </article>
      ))}
      <h2>Recent activity</h2>
      <ul>
        {activityFeed.map((row) => (
          <li key={row.id}>{row.detail}</li>
        ))}
      </ul>
    </section>
  );
}
`,
    ),
    diff(
      "src/pages/Customers.tsx",
      `const sampleRows = [
  { name: "Northwind Co", status: "Qualified" },
  { name: "Contoso LLC", status: "Contacted" },
];

export default function CustomersPage() {
  function handleCreate() {}
  function handleEdit() {}
  function handleDelete() {}

  return (
    <section className="p-6">
      <h1>Customers</h1>
      <button type="button" onClick={handleCreate}>Add Customer</button>
      <button type="button" onClick={handleEdit}>Edit Customer</button>
      <button type="button" onClick={handleDelete}>Delete Customer</button>
      <table>
        <tbody>
          {sampleRows.map((row) => (
            <tr key={row.name}>
              <td>{row.name}</td>
              <td>{row.status}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
`,
    ),
    diff(
      "src/pages/Settings.tsx",
      `import { useState } from "react";

export default function SettingsPage() {
  const [theme, setTheme] = useState(() => window.localStorage.getItem("fieldflow-theme") ?? "dark");

  return (
    <section className="p-6">
      <h1>Settings</h1>
      <button
        type="button"
        onClick={() => {
          const next = theme === "dark" ? "light" : "dark";
          setTheme(next);
          window.localStorage.setItem("fieldflow-theme", next);
        }}
      >
        Toggle theme ({theme})
      </button>
    </section>
  );
}
`,
    ),
    diff(
      "src/status/jobs.ts",
      `export const JOB_STATUSES = [
  "Scheduled",
  "In Progress",
  "Complete",
  "Cancelled",
] as const;

export type JobStatus = (typeof JOB_STATUSES)[number];
`,
    ),
    diff(
      "src/status/invoices.ts",
      `export const INVOICE_STATUSES = ["Draft", "Sent", "Paid", "Overdue"] as const;

export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
`,
    ),
    diff(
      "src/status/leads.ts",
      `export const LEAD_STATUSES = ["New", "Contacted", "Qualified", "Lost"] as const;

export type LeadStatus = (typeof LEAD_STATUSES)[number];
`,
    ),
  ];
}

export function fieldFlowStubDiffs(): RunFileDiff[] {
  return [
    diff(
      "src/App.tsx",
      `export default function App() {
  return <p>Empty shell</p>;
}
`,
    ),
  ];
}
