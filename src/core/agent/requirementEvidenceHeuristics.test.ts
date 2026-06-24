import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  detectActivityFeedEvidence,
  detectCrudButtonEvidence,
  detectDarkDashboardEvidence,
  detectReactRouterEvidence,
  detectResponsiveLayoutEvidence,
  detectTablesWithMockDataEvidence,
  detectTailwindEvidence,
} from "@/core/agent/requirementEvidenceHeuristics";

const fieldFlowSources = [
  {
    path: "package.json",
    content: JSON.stringify({
      dependencies: {
        "react-router-dom": "^6.28.0",
        "lucide-react": "^0.460.0",
      },
    }),
  },
  {
    path: "src/App.tsx",
    content: `
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
export default function App() {
  return (
    <BrowserRouter>
      <div className="flex min-h-screen bg-slate-900 text-white">
        <aside className="sidebar w-64 p-4">Dashboard</aside>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/customers" element={<Customers />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}`,
  },
  {
    path: "src/pages/Dashboard.tsx",
    content: `
export default function Dashboard() {
  const recentActivity = [{ id: 1, label: "New lead" }];
  return (
    <section className="p-6 md:p-8 lg:grid lg:grid-cols-3 gap-4">
      <h1>Dashboard</h1>
      <div className="rounded-lg shadow-md bg-slate-800 p-4">Recent activity</div>
      <ul>{recentActivity.map((item) => <li key={item.id}>{item.label}</li>)}</ul>
    </section>
  );
}`,
  },
  {
    path: "src/pages/Customers.tsx",
    content: `
const mockCustomers = [{ name: "Acme", status: "Active" }];
export default function Customers() {
  return (
    <section>
      <button type="button" onClick={() => {}}>Add Customer</button>
      <table><tbody>{mockCustomers.map((c) => <tr><td>{c.name}</td></tr>)}</tbody></table>
    </section>
  );
}`,
  },
];

describe("requirementEvidenceHeuristics", () => {
  it("detects React Router from package.json or routing imports", () => {
    const result = detectReactRouterEvidence(fieldFlowSources);
    assert.equal(result.passed, true);
    assert.ok(result.refs.some((ref) => ref.file.includes("package.json")));
  });

  it("detects Tailwind from utility classes without tailwind.config", () => {
    const result = detectTailwindEvidence(fieldFlowSources);
    assert.equal(result.passed, true);
    assert.ok(result.refs.some((ref) => ref.file.endsWith(".tsx")));
  });

  it("detects dark SaaS dashboard layout", () => {
    const result = detectDarkDashboardEvidence(fieldFlowSources);
    assert.equal(result.passed, true);
  });

  it("detects responsive layout classes", () => {
    const result = detectResponsiveLayoutEvidence(fieldFlowSources);
    assert.equal(result.passed, true);
  });

  it("detects recent activity feed UI", () => {
    const result = detectActivityFeedEvidence(fieldFlowSources);
    assert.equal(result.passed, true);
  });

  it("detects tables with mock data", () => {
    const result = detectTablesWithMockDataEvidence(fieldFlowSources);
    assert.equal(result.passed, true);
  });

  it("detects CRUD buttons", () => {
    const result = detectCrudButtonEvidence(fieldFlowSources);
    assert.equal(result.passed, true);
  });
});
