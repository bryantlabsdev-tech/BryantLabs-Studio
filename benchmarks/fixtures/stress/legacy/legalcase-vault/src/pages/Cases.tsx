import { useState } from "react";
import { CaseStatus } from "../types";

// Mock Case type if not defined yet
// export interface Case { id: string; caseNumber: string; title: string; clientName: string; status: CaseStatus; dateFiled: string; }

const mockCases: Array<Record<string, unknown>> = [
  { id: "cs-001", caseNumber: "CV-2023-101", title: "Smith v. Johnson", clientName: "Jane Smith", status: "In Progress", dateFiled: "2023-01-15",
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
  description: "",
  openDate: new Date().toISOString().slice(0, 10),
  closeDate: new Date().toISOString().slice(0, 10),
  clientIds: [],
},
  { id: "cs-002", caseNumber: "CR-2023-202", title: "State v. Doe", clientName: "John Doe", status: "Open", dateFiled: "2023-03-22", },
  { id: "cs-003", caseNumber: "FAM-2022-050", title: "Doe v. Doe", clientName: "John Doe", status: "Closed", dateFiled: "2022-07-10", },
  { id: "cs-004", caseNumber: "CIV-2023-334", title: "Innovate Inc. v. Competitor", clientName: "Innovate Inc.", status: "On Hold", dateFiled: "2023-05-01", },
];

const statusColors: Record<string, string> = {
  Open: "bg-blue-500/20 text-blue-300",
  "In Progress": "bg-yellow-500/20 text-yellow-300",
  "On Hold": "bg-gray-500/20 text-gray-300",
  Closed: "bg-green-500/20 text-green-300",
  Dismissed: "bg-red-500/20 text-red-300",
};

const StatusBadge = ({ status }: { status: CaseStatus }) => (
  <span className={`inline-flex items-center rounded-md px-2 py-1 text-xs font-medium ${statusColors[status]}`}>
    {status}
  </span>
);

const Cases = () => {
  const [cases] = useState<Array<Record<string, unknown>>>(mockCases);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">Cases</h1>
        <button className="rounded-md bg-indigo-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600">
          New Case
        </button>
      </div>

      <div className="panel-card mt-6 overflow-x-auto">
        {cases.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-700">
            <thead>
              <tr>
                <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold sm:pl-6">Case</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold">Client</th>
                <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold">Status</th>
                <th scope="col" className="relative py-3.5 pl-3 pr-4 sm:pr-6"><span className="sr-only">Edit</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {cases.map((caseItem) => (
                <tr key={caseItem.id}>
                  <td className="whitespace-nowrap py-4 pl-4 pr-3 text-sm sm:pl-6">
                    <div className="font-medium">{caseItem.title}</div>
                    <div className="text-gray-400">{caseItem.caseNumber}</div>
                  </td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm text-gray-300">{caseItem.clientName}</td>
                  <td className="whitespace-nowrap px-3 py-4 text-sm"><StatusBadge status={caseItem.status} /></td>
                  <td className="relative whitespace-nowrap py-4 pl-3 pr-4 text-right text-sm font-medium sm:pr-6">
                    <a href="#" className="text-indigo-400 hover:text-indigo-300">View</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-12 text-center">
            <h3 className="text-lg font-semibold">No Cases Found</h3>
            <p className="mt-1 text-sm text-gray-400">Get started by creating a new case.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Cases;