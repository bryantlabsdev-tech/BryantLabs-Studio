import { useState } from "react";
import { FiFile, FiDownload, FiPlayCircle } from "../components/IconStub";
import type { GeneratedReport, ReportType } from "../types";

const mockGeneratedReports: GeneratedReport[] = [
  { id: "rep-001", name: "Q2 2024 Billing Summary", type: "Client Billing", generatedAt: "2024-07-01", status: "Completed" },
  { id: "rep-002", name: "Evidence Log for Smith v. Johnson", type: "Evidence Log", generatedAt: "2024-06-28", status: "Completed" },
  { id: "rep-003", name: "Full Case Summary - State v. Doe", type: "Case Summary", generatedAt: "2024-06-25", status: "Completed" },
  { id: "rep-004", name: "Upcoming Deadlines (Next 30 Days)", type: "Deadline Calendar", generatedAt: "2024-07-11", status: "Processing" },
];

const reportTypes: ReportType[] = ["Case Summary", "Client Billing", "Evidence Log", "Deadline Calendar"];

const getStatusBadgeClass = (status: GeneratedReport['status']) => {
  switch (status) {
    case "Completed": return "bg-green-500/20 text-green-300";
    case "Processing": return "bg-blue-500/20 text-blue-300 animate-pulse";
    case "Failed": return "bg-red-500/20 text-red-300";
    default: return "bg-gray-500/20 text-gray-300";
  }
};

const Reports = () => {
  const [reports] = useState<GeneratedReport[]>(mockGeneratedReports);
  const [selectedReportType, setSelectedReportType] = useState<ReportType>(reportTypes[0]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Reports</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <form className="panel-card p-6" onSubmit={(e) => e.preventDefault()}>
            <h2 className="text-lg font-semibold text-white mb-4">Generate New Report</h2>
            <div className="space-y-4">
              <div>
                <label htmlFor="reportType" className="block text-sm font-medium text-gray-300 mb-1">Report Type</label>
                <select id="reportType" value={selectedReportType} onChange={(e) => setSelectedReportType(e.target.value as ReportType)} className="w-full bg-gray-700 border border-gray-600 rounded-md shadow-sm pl-3 pr-10 py-2 text-white focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm">
                  {reportTypes.map((type) => (<option key={type}>{type}</option>))}
                </select>
              </div>
              <button type="submit" className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500">
                <FiPlayCircle /> Generate Report
              </button>
            </div>
          </form>
        </div>
        <div className="lg:col-span-2 panel-card">
          <h2 className="text-lg font-semibold text-white p-6 border-b border-gray-700">Recent Reports</h2>
          {reports.length === 0 ? (
            <div className="py-20 text-center">
              <FiFile className="mx-auto text-5xl text-gray-500" />
              <h3 className="mt-2 text-lg font-medium text-white">No reports generated</h3>
              <p className="mt-1 text-sm text-gray-400">Generate your first report to see it here.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-full">
                <tbody className="divide-y divide-gray-800">
                  {reports.map((report) => (
                    <tr key={report.id}>
                      <td className="px-6 py-4 whitespace-nowrap"><div className="text-sm font-medium text-white">{report.name}</div><div className="text-sm text-gray-400">{report.type}</div></td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-400">{report.generatedAt}</td>
                      <td className="px-6 py-4 whitespace-nowrap"><span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(report.status)}`}>{report.status}</span></td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <button className="text-indigo-400 hover:text-indigo-300 disabled:opacity-50 disabled:cursor-not-allowed" disabled={report.status !== 'Completed'} title="Download Report"><FiDownload className="w-5 h-5" /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default Reports;