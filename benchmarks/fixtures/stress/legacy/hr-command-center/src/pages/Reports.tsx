import { useState } from "react";
import type { Report } from '../types';

const mockReports: Report[] = [
  {
    id: 'rep-1',
    title: 'Headcount Summary',
    description: 'A summary of employee headcount by department and location.',
    lastGenerated: '2023-11-01',
  name: "",
  type: "Headcount",
  generatedDate: new Date().toISOString().slice(0, 10),
  parameters: {},
  dataUrl: "",
},
  {
    id: 'rep-2',
    title: 'Turnover Rate',
    description: 'Analyze employee turnover rates over selected time periods.',
    lastGenerated: '2023-10-28',
  name: "",
  type: "Headcount",
  generatedDate: new Date().toISOString().slice(0, 10),
  parameters: {},
  dataUrl: "",
},
  {
    id: 'rep-3',
    title: 'Compensation Analysis',
    description: 'Breakdown of salary and bonus distribution across the company.',
    lastGenerated: undefined,
  name: "",
  type: "Headcount",
  generatedDate: new Date().toISOString().slice(0, 10),
  parameters: {},
  dataUrl: "",
},
  {
    id: 'rep-4',
    title: 'Diversity & Inclusion',
    description: 'Demographic data report to track D&I initiatives.',
    lastGenerated: '2023-09-15',
  name: "",
  type: "Headcount",
  generatedDate: new Date().toISOString().slice(0, 10),
  parameters: {},
  dataUrl: "",
},
  {
    id: 'rep-5',
    title: 'Time Off Accrual',
    description: 'Detailed report on employee time off balances and usage.',
    lastGenerated: undefined,
  name: "",
  type: "Headcount",
  generatedDate: new Date().toISOString().slice(0, 10),
  parameters: {},
  dataUrl: "",
},
];

export default function Reports() {
  const [reports] = useState<Report[]>(mockReports);

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-2xl font-semibold text-white">Reports</h2>
        <p className="mt-1 text-gray-400">Generate and view key HR reports.</p>
      </div>

      {reports.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reports.map((report) => (
            <div key={report.id} className="panel-card flex flex-col justify-between bg-gray-800 p-6 rounded-lg">
              <div>
                <h3 className="text-lg font-semibold text-white">{report.title}</h3>
                <p className="mt-2 text-sm text-gray-400">{report.description}</p>
              </div>
              <div className="mt-6">
                <p className="text-xs text-gray-500 mb-2">
                  Last generated: {report.lastGenerated || 'Never'}
                </p>
                <button className="w-full px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900">
                  {report.lastGenerated ? 'View Report' : 'Generate Report'}
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel-card text-center bg-gray-800 rounded-lg py-12">
          <h3 className="text-lg font-semibold text-gray-300">No Reports Available</h3>
          <p className="mt-1 text-sm text-gray-500">Contact support to enable reporting features.</p>
        </div>
      )}
    </div>
  );
}