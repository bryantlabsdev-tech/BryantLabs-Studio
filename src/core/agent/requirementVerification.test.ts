import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { extractPromptRequirements } from "@/core/agent/requirementExtraction";
import {
  applyRequirementOutcome,
  buildRequirementChecklist,
  evaluateRequirementChecklist,
  requirementStatusLabel,
  requirementTypeLabel,
} from "@/core/agent/requirementVerification";
import { mockProjectScan } from "@/core/repository/testScan";

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

function fieldFlowGeneratedDiffs() {
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

const FIELD_FLOW_PROMPT = [
  "Build a FieldFlow CRM app.",
  "Dashboard with KPI cards.",
  "Customers page.",
  "Estimates page.",
  "AI assistant card on dashboard.",
].join(" ");

function labels(prompt: string): string[] {
  return extractPromptRequirements(prompt).map((item) => item.label);
}

function hasStandaloneLabel(prompt: string, fragment: string): boolean {
  return extractPromptRequirements(prompt).some(
    (item) => item.label.trim().toLowerCase() === fragment.toLowerCase(),
  );
}

describe("requirementExtraction", () => {
  it("groups FieldFlow status enums instead of standalone status words", () => {
    const extracted = extractPromptRequirements(FIELD_FLOW_EXTRACTION_PROMPT);

    assert.equal(
      hasStandaloneLabel(FIELD_FLOW_EXTRACTION_PROMPT, "Complete"),
      false,
    );
    assert.equal(
      hasStandaloneLabel(FIELD_FLOW_EXTRACTION_PROMPT, "Cancelled"),
      false,
    );
    assert.equal(
      hasStandaloneLabel(FIELD_FLOW_EXTRACTION_PROMPT, "Monthly Revenue"),
      false,
    );
    assert.equal(
      hasStandaloneLabel(FIELD_FLOW_EXTRACTION_PROMPT, "Also include"),
      false,
    );

    const jobStatuses = extracted.find((item) => /job statuses include/i.test(item.label));
    assert.ok(jobStatuses);
    assert.equal(jobStatuses.type, "status_enum");
    assert.deepEqual(jobStatuses.values, [
      "Scheduled",
      "In Progress",
      "Complete",
      "Cancelled",
    ]);

    const invoiceStatuses = extracted.find((item) =>
      /invoice statuses include/i.test(item.label),
    );
    assert.ok(invoiceStatuses);
    assert.equal(invoiceStatuses.type, "status_enum");

    const leadStatuses = extracted.find((item) =>
      /lead statuses include/i.test(item.label),
    );
    assert.ok(leadStatuses);
    assert.equal(leadStatuses.type, "status_enum");
  });

  it("groups Dashboard KPI list into one feature requirement", () => {
    const extracted = extractPromptRequirements(FIELD_FLOW_EXTRACTION_PROMPT);
    const kpi = extracted.find((item) => /dashboard shows kpi cards/i.test(item.label));
    assert.ok(kpi);
    assert.equal(kpi.type, "feature");
    assert.ok(kpi.values?.includes("Monthly Revenue"));
    assert.equal(labels(FIELD_FLOW_EXTRACTION_PROMPT).filter((l) => l === "Monthly Revenue").length, 0);
  });

  it("marks visual polish and self-audit as advisory", () => {
    const extracted = extractPromptRequirements(FIELD_FLOW_EXTRACTION_PROMPT);
    const polish = extracted.find((item) => /visual polish/i.test(item.label));
    const audit = extracted.find((item) => /self-audit/i.test(item.label));
    const quality = extracted.find((item) => /clean reusable components/i.test(item.label));

    assert.ok(polish);
    assert.equal(polish.type, "quality");
    assert.equal(polish.advisory, true);
    assert.equal(requirementTypeLabel(polish.type, polish.advisory), "quality/advisory");

    assert.ok(audit);
    assert.equal(audit.type, "audit_task");
    assert.equal(audit.advisory, true);
    assert.equal(requirementTypeLabel(audit.type, audit.advisory), "audit_task/advisory");

    assert.ok(quality);
    assert.equal(quality.type, "quality");
    assert.equal(quality.advisory, true);
  });

  it("extracts pages and tech items under section context", () => {
    const extracted = extractPromptRequirements(FIELD_FLOW_EXTRACTION_PROMPT);
    const pages = extracted.filter((item) => item.type === "page");
    assert.ok(pages.some((item) => /dashboard page/i.test(item.label)));
    assert.ok(pages.some((item) => /customers page/i.test(item.label)));
    assert.ok(pages.some((item) => /settings page/i.test(item.label)));

    const tech = extracted.filter((item) => item.type === "tech");
    assert.ok(tech.some((item) => /react router/i.test(item.label)));
    assert.ok(tech.some((item) => /localstorage/i.test(item.label)));
  });
});

describe("requirementVerification", () => {
  it("marks all requirements UNKNOWN when zero implementation files exist", () => {
    const result = evaluateRequirementChecklist({
      prompt: FIELD_FLOW_PROMPT,
      fileDiffs: [],
      generatedFiles: [],
      scan: mockProjectScan(["src/App.tsx", "src/pages/Dashboard.tsx"]),
      buildPassed: true,
    });

    assert.equal(result.implementationFileCount, 0);
    assert.equal(result.allSatisfied, false);
    assert.ok(result.items.length > 0);
    for (const item of result.items) {
      assert.equal(item.status, "unknown");
      assert.equal(item.satisfied, false);
      assert.equal(item.detected, true);
      assert.match(item.reason ?? "", /No generated or modified files/i);
    }
    assert.equal(applyRequirementOutcome("success", result), "incomplete");
  });

  it("does not pass requirements by matching prompt keywords alone", () => {
    const result = evaluateRequirementChecklist({
      prompt: FIELD_FLOW_PROMPT,
      fileDiffs: [],
      generatedFiles: [],
      buildPassed: true,
    });

    const dashboard = result.items.find((item) => /dashboard/i.test(item.label));
    assert.ok(dashboard);
    assert.notEqual(dashboard.status, "pass");
  });

  it("passes requirements only with evidence in generated or modified source", () => {
    const result = evaluateRequirementChecklist({
      prompt: "Add Dashboard page with KPI cards",
      fileDiffs: [
        {
          path: "src/pages/Dashboard.tsx",
          linesAdded: 20,
          linesRemoved: 0,
          preview: [],
          before: "",
          after: `export default function Dashboard() {
  return <section><h1>Dashboard</h1><div className="kpi-cards">KPI</div></section>;
}`,
        },
      ],
      buildPassed: true,
    });

    const dashboard = result.items.find((item) => /dashboard/i.test(item.label));
    assert.ok(dashboard);
    assert.equal(dashboard.status, "pass");
    assert.ok(dashboard.evidence?.includes("src/pages/Dashboard.tsx"));
  });

  it("shows file and line evidence for localStorage usage", () => {
    const result = evaluateRequirementChecklist({
      prompt: "Persist leads in localStorage",
      fileDiffs: [
        {
          path: "src/hooks/useLeads.ts",
          linesAdded: 8,
          linesRemoved: 0,
          preview: [],
          before: "",
          after: `export function useLeads() {
  const raw = localStorage.getItem("leads");
  return raw ? JSON.parse(raw) : [];
}`,
        },
      ],
      buildPassed: true,
    });

    const storage = result.items.find((item) => /localStorage/i.test(item.label));
    assert.ok(storage);
    assert.equal(storage.status, "pass");
    assert.match(storage.evidence ?? "", /useLeads\.ts/);
    assert.match(storage.evidence ?? "", /line/i);
  });

  it("does not fail completion when only advisory requirements are unmet", () => {
    const result = evaluateRequirementChecklist({
      prompt: FIELD_FLOW_EXTRACTION_PROMPT,
      fileDiffs: [
        {
          path: "src/App.tsx",
          linesAdded: 8,
          linesRemoved: 0,
          preview: [],
          before: "",
          after: 'export default function App() { return <div>FieldFlow CRM</div>; }',
        },
        {
          path: "src/pages/Dashboard.tsx",
          linesAdded: 40,
          linesRemoved: 0,
          preview: [],
          before: "",
          after: `export default function Dashboard() {
  return <section>
    <h1>Dashboard</h1>
    <div>New Leads</div>
    <div>Active Jobs</div>
    <div>Open Estimates</div>
    <div>Unpaid Invoices</div>
    <div>Monthly Revenue</div>
  </section>;
}`,
        },
        {
          path: "src/pages/Customers.tsx",
          linesAdded: 10,
          linesRemoved: 0,
          preview: [],
          before: "",
          after: "export default function Customers() { return <div>Customers</div>; }",
        },
        {
          path: "src/pages/Settings.tsx",
          linesAdded: 10,
          linesRemoved: 0,
          preview: [],
          before: "",
          after: "export default function Settings() { return <div>Settings</div>; }",
        },
        {
          path: "src/hooks/useJobs.ts",
          linesAdded: 12,
          linesRemoved: 0,
          preview: [],
          before: "",
          after: `const statuses = ["Scheduled", "In Progress", "Complete", "Cancelled"];
export function useJobs() { return statuses; }`,
        },
        {
          path: "src/types/invoice.ts",
          linesAdded: 8,
          linesRemoved: 0,
          preview: [],
          before: "",
          after: `export type InvoiceStatus = "Draft" | "Sent" | "Paid" | "Overdue";`,
        },
        {
          path: "src/types/lead.ts",
          linesAdded: 8,
          linesRemoved: 0,
          preview: [],
          before: "",
          after: `export type LeadStatus = "New" | "Contacted" | "Qualified" | "Lost";`,
        },
        {
          path: "package.json",
          linesAdded: 5,
          linesRemoved: 0,
          preview: [],
          before: "",
          after: '{"dependencies":{"react-router-dom":"^6.0.0"}}',
        },
        {
          path: "src/storage.ts",
          linesAdded: 4,
          linesRemoved: 0,
          preview: [],
          before: "",
          after: 'localStorage.setItem("jobs", "[]");',
        },
      ],
      buildPassed: true,
    });

    const advisoryFailed = result.items.filter(
      (item) => item.advisory && item.status !== "pass",
    );
    const hardFailed = result.items.filter(
      (item) => !item.advisory && item.status !== "pass",
    );
    assert.equal(
      hardFailed.length,
      0,
      `hard failures: ${hardFailed.map((item) => item.label).join("; ")}`,
    );
    assert.equal(result.allSatisfied, true);
    assert.equal(applyRequirementOutcome("success", result), "success");
    assert.ok(
      result.items.some((item) => item.advisory),
      "expected advisory checklist items",
    );
    assert.ok(
      advisoryFailed.length === 0 || hardFailed.length === 0,
      "advisory items must not block completion",
    );
  });

  it("verifies grouped status enums together", () => {
    const result = evaluateRequirementChecklist({
      prompt: "Job statuses: Scheduled, In Progress, Complete, Cancelled",
      fileDiffs: [
        {
          path: "src/types/job.ts",
          linesAdded: 6,
          linesRemoved: 0,
          preview: [],
          before: "",
          after: `export type JobStatus = "Scheduled" | "In Progress" | "Complete" | "Cancelled";`,
        },
      ],
      buildPassed: true,
    });

    const statusItem = result.items.find((item) => item.type === "status_enum");
    assert.ok(statusItem);
    assert.equal(statusItem.status, "pass");
    assert.equal(
      hasStandaloneLabel("Job statuses: Scheduled, In Progress, Complete, Cancelled", "Complete"),
      false,
    );
  });

  it("labels implementation status strings", () => {
    assert.equal(requirementStatusLabel("pass"), "PASS");
    assert.equal(requirementStatusLabel("fail"), "FAIL");
    assert.equal(requirementStatusLabel("unknown"), "UNKNOWN");
    assert.equal(requirementStatusLabel("unknown", true), "ADVISORY");
    assert.equal(requirementStatusLabel("pass", true), "PASS (advisory)");
  });

  it("buildRequirementChecklist includes type metadata", () => {
    const checklist = buildRequirementChecklist(FIELD_FLOW_EXTRACTION_PROMPT);
    assert.ok(checklist.some((item) => item.type === "page"));
    assert.ok(checklist.some((item) => item.advisory));
  });

  it("classifies vague quality and audit/reporting lines as advisory", () => {
    const extracted = extractPromptRequirements(FIELD_FLOW_FULL_PROMPT);
    const modern = extracted.find((item) => /modern dark saas dashboard/i.test(item.label));
    const responsive = extracted.find((item) => /mobile responsive/i.test(item.label));
    const routingCheck = extracted.find((item) => /check routing works/i.test(item.label));
    const summary = extracted.find((item) => /return summary/i.test(item.label));

    assert.ok(modern);
    assert.equal(modern.type, "quality");
    assert.equal(modern.advisory, true);

    assert.ok(responsive);
    assert.equal(responsive.advisory, true);

    assert.ok(routingCheck);
    assert.equal(routingCheck.type, "audit_task");
    assert.equal(routingCheck.advisory, true);

    assert.ok(summary);
    assert.equal(summary.type, "audit_task");
    assert.equal(summary.advisory, true);
  });

  it("passes FieldFlow tech and UI requirements with heuristic evidence", () => {
    const result = evaluateRequirementChecklist({
      prompt: FIELD_FLOW_FULL_PROMPT,
      fileDiffs: fieldFlowGeneratedDiffs(),
      buildPassed: true,
    });

    const byLabel = (pattern: RegExp) =>
      result.items.find((item) => pattern.test(item.label));

    assert.equal(byLabel(/tailwind/i)?.status, "pass");
    assert.equal(byLabel(/react router/i)?.status, "pass");
    assert.equal(byLabel(/lucide/i)?.status, "pass");
    assert.equal(byLabel(/recent activity/i)?.status, "pass");
    assert.equal(byLabel(/tables with mock/i)?.status, "pass");
    assert.equal(byLabel(/modern dark saas dashboard/i)?.status, "pass");
    assert.equal(byLabel(/mobile responsive/i)?.status, "pass");
    assert.equal(byLabel(/check routing works/i)?.status, "pass");
    assert.equal(byLabel(/check crud buttons/i)?.status, "pass");
    assert.equal(byLabel(/return summary/i)?.status, "pass");

    const hardFailed = result.items.filter(
      (item) => !item.advisory && item.status !== "pass",
    );
    assert.equal(
      hardFailed.length,
      0,
      `unexpected hard failures: ${hardFailed.map((item) => item.label).join("; ")}`,
    );
    assert.equal(result.allSatisfied, true);
    assert.equal(applyRequirementOutcome("success", result), "success");
  });

  it("never shows FAIL for advisory quality or audit items", () => {
    const result = evaluateRequirementChecklist({
      prompt: FIELD_FLOW_FULL_PROMPT,
      fileDiffs: fieldFlowGeneratedDiffs(),
      buildPassed: true,
    });

    for (const item of result.items.filter((entry) => entry.advisory)) {
      assert.notEqual(item.status, "fail", item.label);
      assert.notEqual(requirementStatusLabel(item.status, true), "FAIL", item.label);
    }
  });
});
