import type { RunFileDiff } from "@/core/agent/runFileDiffs";

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

export function fieldFlowGeneratedDiffs(): RunFileDiff[] {
  return [
    {
      path: "package.json",
      linesAdded: 20,
      linesRemoved: 0,
      preview: [],
      before: "",
      after: JSON.stringify({
        dependencies: {
          "react-router-dom": "^6.28.0",
          "lucide-react": "^0.460.0",
        },
      }),
    },
    {
      path: "src/App.tsx",
      linesAdded: 30,
      linesRemoved: 0,
      preview: [],
      before: "",
      after: `import { BrowserRouter, Routes, Route } from "react-router-dom";
import Dashboard from "./pages/Dashboard";
import Customers from "./pages/Customers";
import Settings from "./pages/Settings";
import { useEffect } from "react";

export default function App() {
  useEffect(() => {
    localStorage.setItem("fieldflow", "ready");
  }, []);
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-slate-900 text-white">
        <aside className="sidebar">Nav</aside>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/customers" element={<Customers />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}`,
    },
    {
      path: "src/pages/Dashboard.tsx",
      linesAdded: 40,
      linesRemoved: 0,
      preview: [],
      before: "",
      after: `export default function Dashboard() {
  const recentActivity = [{ id: 1, label: "Lead added" }];
  return (
    <section className="p-6 md:p-8 lg:grid lg:grid-cols-3 gap-4 rounded-lg shadow-md bg-slate-800">
      <h1>Dashboard</h1>
      <div>New Leads</div>
      <div>Active Jobs</div>
      <div>Monthly Revenue</div>
      <div>Recent activity</div>
      <ul>{recentActivity.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
    </section>
  );
}`,
    },
    {
      path: "src/pages/Customers.tsx",
      linesAdded: 20,
      linesRemoved: 0,
      preview: [],
      before: "",
      after: `const mockCustomers = [{ name: "Acme" }];
export default function Customers() {
  return (
    <section>
      <button type="button">Add Customer</button>
      <button type="button">Edit Customer</button>
      <button type="button">Delete Customer</button>
      <table><tbody>{mockCustomers.map((c) => <tr><td>{c.name}</td></tr>)}</tbody></table>
    </section>
  );
}`,
    },
    {
      path: "src/pages/Settings.tsx",
      linesAdded: 8,
      linesRemoved: 0,
      preview: [],
      before: "",
      after: "export default function Settings() { return <div>Settings</div>; }",
    },
    {
      path: "src/types/job.ts",
      linesAdded: 6,
      linesRemoved: 0,
      preview: [],
      before: "",
      after: `export type JobStatus = "Scheduled" | "In Progress" | "Complete" | "Cancelled";`,
    },
    {
      path: "src/types/invoice.ts",
      linesAdded: 6,
      linesRemoved: 0,
      preview: [],
      before: "",
      after: `export type InvoiceStatus = "Draft" | "Sent" | "Paid" | "Overdue";`,
    },
    {
      path: "src/types/lead.ts",
      linesAdded: 6,
      linesRemoved: 0,
      preview: [],
      before: "",
      after: `export type LeadStatus = "New" | "Contacted" | "Qualified" | "Lost";`,
    },
  ];
}

export function fieldFlowStubDiffs(): RunFileDiff[] {
  return [
    {
      path: "src/App.tsx",
      linesAdded: 2,
      linesRemoved: 0,
      preview: [],
      before: "",
      after: "export default function App(){return <div>FieldFlow</div>}",
    },
  ];
}
