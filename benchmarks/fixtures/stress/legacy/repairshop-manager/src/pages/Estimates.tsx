import { useState } from "react";
import { EntityId, EstimateStatus } from "../types";
import { PlusIcon } from "../components/IconStub";
// This type would typically be in `src/types.ts`
export interface Estimate {
  id: EntityId;
  customerName: string;
  vehicle: string;
  status: EstimateStatus;
  sentDate: string;
  amount: number;
}

const mockEstimates: Estimate[] = [
  { id: "EST-001", customerName: "John Doe", vehicle: "2020 Toyota Camry", status: "Sent", sentDate: "2023-10-26", amount: 450.00 },
  { id: "EST-002", customerName: "Jane Smith", vehicle: "2018 Honda Civic", status: "Approved", sentDate: "2023-10-25", amount: 1200.50 },
  { id: "EST-003", customerName: "Bob Johnson", vehicle: "2022 Ford F-150", status: "Draft", sentDate: "2023-10-27", amount: 85.00 },
  { id: "EST-004", customerName: "Alice Williams", vehicle: "2019 Subaru Outback", status: "Declined", sentDate: "2023-10-20", amount: 620.75 },
];

const getStatusBadgeClass = (status: EstimateStatus): string => {
  const baseClass = "px-2 py-1 text-xs font-medium rounded-full";
  switch (status) {
    case 'Draft': return `${baseClass} bg-gray-500/20 text-gray-400`;
    case 'Sent': return `${baseClass} bg-blue-500/20 text-blue-400`;
    case 'Approved': return `${baseClass} bg-green-500/20 text-green-400`;
    case 'Declined': return `${baseClass} bg-red-500/20 text-red-400`;
    default: return baseClass;
  }
};

export default function Estimates() {
  const [estimates] = useState<Estimate[]>(mockEstimates);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">Estimates</h1>
        <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors">
          <PlusIcon className="h-5 w-5" />
          New Estimate
        </button>
      </div>

      <div className="panel-card bg-gray-800/50 border border-gray-700 rounded-lg">
        <div className="p-4 border-b border-gray-700">
          <input
            type="text"
            placeholder="Search estimates..."
            className="w-full sm:w-1/3 bg-gray-900 border border-gray-700 rounded-md py-2 px-4 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        {estimates.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-700 text-sm text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Estimate ID</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Vehicle</th>
                  <th className="px-4 py-3 font-medium">Date Sent</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {estimates.map((est) => (
                  <tr key={est.id} className="hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-mono text-sm text-indigo-400">{est.id}</td>
                    <td className="px-4 py-3">{est.customerName}</td>
                    <td className="px-4 py-3">{est.vehicle}</td>
                    <td className="px-4 py-3">{est.sentDate}</td>
                    <td className="px-4 py-3 text-right">${est.amount.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={getStatusBadgeClass(est.status)}>{est.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-gray-300">No Estimates Found</h3>
            <p className="text-gray-500 mt-1">Get started by creating a new estimate.</p>
          </div>
        )}
      </div>
    </div>
  );
}