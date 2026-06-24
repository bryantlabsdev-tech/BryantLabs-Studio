import { useState } from "react";
import type { Case, CaseStatus } from "../types";

const mockCases: Case[] = [
  { id: 'C-001', caseNumber: '2023-CIV-0123', title: 'Smith v. Acme Corp', clientName: 'John Smith', status: 'Open', dateFiled: '2023-01-15',
  clientId: "",
  description: "",
  dateOpened: new Date().toISOString().slice(0, 10),
},
  { id: 'C-002', caseNumber: '2023-EST-0456', title: 'Doe Real Estate', clientName: 'Jane Doe', status: 'Pending', dateFiled: '2023-02-20',
  clientId: "",
  description: "",
  dateOpened: new Date().toISOString().slice(0, 10),
},
  { id: 'C-003', caseNumber: '2022-PAT-0789', title: 'Innovate LLC Patent', clientName: 'Innovate LLC', status: 'On Hold', dateFiled: '2022-11-30',
  clientId: "",
  description: "",
  dateOpened: new Date().toISOString().slice(0, 10),
},
  { id: 'C-004', caseNumber: '2021-CIV-0101', title: 'Jones v. Globex', clientName: 'David Jones', status: 'Closed', dateFiled: '2021-03-10',
  clientId: "",
  description: "",
  dateOpened: new Date().toISOString().slice(0, 10),
},
];

const StatusBadge = ({ status }: { status: CaseStatus }) => {
  const statusStyles: Record<string, string> = {
    'Open': 'bg-blue-500/20 text-blue-300',
    'Pending': 'bg-yellow-500/20 text-yellow-300',
    'On Hold': 'bg-purple-500/20 text-purple-300',
    'Closed': 'bg-gray-500/20 text-gray-300',
  };
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusStyles[status]}`}>
      {status}
    </span>
  );
};

const Cases = () => {
  const [cases] = useState<Case[]>(mockCases);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Cases</h1>
        <button className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md">
          Add New Case
        </button>
      </div>
      <div className="panel-card overflow-hidden">
        {cases.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th scope="col" className="px-6 py-3">Case Number</th>
                  <th scope="col" className="px-6 py-3">Title</th>
                  <th scope="col" className="px-6 py-3">Client</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3">Date Filed</th>
                  <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {cases.map((caseItem) => (
                  <tr key={caseItem.id} className="border-b border-gray-700 hover:bg-gray-700/30">
                    <td className="px-6 py-4 font-mono text-xs">{caseItem.caseNumber}</td>
                    <td className="px-6 py-4 font-medium text-white whitespace-nowrap">{caseItem.title}</td>
                    <td className="px-6 py-4">{caseItem.clientName}</td>
                    <td className="px-6 py-4"><StatusBadge status={caseItem.status} /></td>
                    <td className="px-6 py-4">{caseItem.dateFiled}</td>
                    <td className="px-6 py-4 text-right">
                      <a href="#" className="font-medium text-blue-500 hover:underline">View</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16">
            <h3 className="text-lg font-semibold">No Cases Found</h3>
            <p className="text-gray-400 mt-2">Get started by adding your first case.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Cases;