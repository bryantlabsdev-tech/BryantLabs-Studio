import { useState } from "react";
// Note: ../types doesn't contain Lease, so we define it here.
// import type { Tenant, Unit } from "../types";

export type LeaseStatus = 'active' | 'expired' | 'upcoming';

export type Lease = {
  id: string;
  tenantName: string;
  unitAddress: string;
  startDate: string;
  endDate: string;
  rentAmount: number;
  status: LeaseStatus;
};

const mockLeases: Lease[] = [
  { id: 'l1', tenantName: 'Alice Johnson', unitAddress: '123 Maple St, #4B', startDate: '2023-06-01', endDate: '2024-05-31', rentAmount: 2200, status: 'active' },
  { id: 'l2', tenantName: 'Bob Williams', unitAddress: '456 Oak Ave, #12', startDate: '2022-02-01', endDate: '2023-01-31', rentAmount: 1850, status: 'expired' },
  { id: 'l3', tenantName: 'Charlie Brown', unitAddress: '789 Pine Ln, #1A', startDate: '2024-08-01', endDate: '2025-07-31', rentAmount: 2500, status: 'upcoming' },
  { id: 'l4', tenantName: 'Diana Prince', unitAddress: '101 Cherry Blvd, #C', startDate: '2023-09-01', endDate: '2024-08-31', rentAmount: 1950, status: 'active' },
];

const statusStyles: Record<LeaseStatus, string> = {
  active: 'bg-green-600/30 text-green-300 border border-green-500/50',
  expired: 'bg-gray-600/30 text-gray-300 border border-gray-500/50',
  upcoming: 'bg-blue-600/30 text-blue-300 border border-blue-500/50',
};

export default function Leases() {
  const [leases] = useState<Lease[]>(mockLeases);

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Leases</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
          Add Lease
        </button>
      </div>

      <div className="panel-card bg-gray-800 border border-gray-700 rounded-lg shadow-md">
        {leases.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th scope="col" className="px-6 py-3">Tenant</th>
                  <th scope="col" className="px-6 py-3">Unit</th>
                  <th scope="col" className="px-6 py-3">Term</th>
                  <th scope="col" className="px-6 py-3">Rent</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {leases.map((lease) => (
                  <tr key={lease.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="px-6 py-4 font-medium text-white">{lease.tenantName}</td>
                    <td className="px-6 py-4">{lease.unitAddress}</td>
                    <td className="px-6 py-4">{lease.startDate} to {lease.endDate}</td>
                    <td className="px-6 py-4">${lease.rentAmount.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full capitalize ${statusStyles[lease.status]}`}>
                        {lease.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">
            <h3 className="text-lg font-semibold">No Leases Found</h3>
            <p className="mt-2">Get started by adding a new lease.</p>
          </div>
        )}
      </div>
    </main>
  );
}