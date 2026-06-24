import { useState } from "react";
import { BarChart3, FileText, Download } from "../components/IconStub";
import type { Report } from "../types";

const availableReports = [
  {
    title: "Case Load Summary",
    description: "Overview of all active, pending, and closed cases.",
    icon: FileText,
  },
  {
    title: "Upcoming Deadlines",
    description: "List of all deadlines in the next 30 days.",
    icon: FileText,
  },
  {
    title: "Client Billing Report",
    description: "Generate billable hours and expenses for a specific client.",
    icon: FileText,
  },
  {
    title: "Evidence Log",
    description: "A complete log of all evidence for a selected case.",
    icon: FileText,
  },
];

const mockRecentReports: Report[] = [
  {
    id: "R-001",
    name: "Case Load Summary - Q2 2024",
    generatedAt: "2024-07-01",
    format: "PDF",
  type: "",
  dateGenerated: new Date().toISOString().slice(0, 10)},
  {
    id: "R-002",
    name: "Upcoming Deadlines - July 2024",
    generatedAt: "2024-06-30",
    format: "CSV",
  type: "",
  dateGenerated: new Date().toISOString().slice(0, 10)},
  {
    id: "R-003",
    name: "Client Billing - Smith v. Acme",
    generatedAt: "2024-06-28",
    format: "PDF",
  type: "",
  dateGenerated: new Date().toISOString().slice(0, 10)},
];

const Reports = () => {
  const [recentReports] = useState<Report[]>(mockRecentReports);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 lg:gap-6 lg:p-6">
      <div className="flex items-center">
        <h1 className="text-lg font-semibold md:text-2xl flex items-center gap-2">
          <BarChart3 className="w-6 h-6" />
          Reports
        </h1>
      </div>

      <div className="panel-card">
        <h2 className="text-xl font-semibold mb-4">Available Reports</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          {availableReports.map((report, index) => (
            <div key={index} className="p-4 rounded-lg bg-gray-900 border border-gray-800 flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <report.icon className="w-5 h-5 text-indigo-400" />
                <h3 className="font-semibold">{report.title}</h3>
              </div>
              <p className="text-sm text-gray-400 flex-grow">{report.description}</p>
              <button className="mt-4 text-sm w-full py-2 bg-indigo-600 hover:bg-indigo-700 rounded-md">
                Generate Report
              </button>
            </div>
          ))}
        </div>
      </div>
      
      <div className="panel-card">
        <h2 className="text-xl font-semibold mb-4">Recently Generated Reports</h2>
        {recentReports.length > 0 ? (
          <ul className="divide-y divide-gray-800">
            {recentReports.map((report) => (
              <li key={report.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="font-medium">{report.name}</p>
                  <p className="text-sm text-gray-400">Generated on {report.generatedAt}</p>
                </div>
                <button className="flex items-center gap-2 text-sm px-3 py-1.5 border border-gray-700 rounded-md hover:bg-gray-800">
                  <Download className="w-4 h-4" />
                  <span>{report.format}</span>
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <div className="text-center py-10">
            <BarChart3 className="mx-auto h-12 w-12 text-gray-500" />
            <h3 className="mt-2 text-lg font-semibold">No Recent Reports</h3>
            <p className="mt-1 text-sm text-gray-400">Generate a report from the options above.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Reports;