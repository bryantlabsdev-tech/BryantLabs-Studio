import { useState } from "react";
// Note: ../types is incomplete, so we define MaintenanceRequest here.

export type MaintenanceStatus = 'new' | 'in_progress' | 'completed';

export type MaintenanceRequest = {
  id: string;
  unitAddress: string;
  issue: string;
  reportedDate: string;
  status: MaintenanceStatus;
};

const mockRequests: MaintenanceRequest[] = [
  { id: 'm1', unitAddress: '123 Maple St, #4B', issue: 'Leaky faucet in kitchen', reportedDate: '2024-07-20', status: 'new' },
  { id: 'm2', unitAddress: '789 Pine Ln, #1A', issue: 'A/C unit not cooling', reportedDate: '2024-07-18', status: 'in_progress' },
  { id: 'm3', unitAddress: '456 Oak Ave, #12', issue: 'Broken window latch', reportedDate: '2024-06-25', status: 'completed' },
  { id: 'm4', unitAddress: '101 Cherry Blvd, #C', issue: 'Smoke detector beeping', reportedDate: '2024-07-21', status: 'new' },
];

const statusStyles: Record<MaintenanceStatus, string> = {
  new: 'bg-blue-600/30 text-blue-300 border border-blue-500/50',
  in_progress: 'bg-yellow-600/30 text-yellow-300 border border-yellow-500/50',
  completed: 'bg-green-600/30 text-green-300 border border-green-500/50',
};

export default function MaintenanceRequests() {
  const [requests] = useState<MaintenanceRequest[]>(mockRequests);

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Maintenance Requests</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
          New Request
        </button>
      </div>

      <div className="panel-card bg-gray-800 border border-gray-700 rounded-lg shadow-md">
        {requests.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th scope="col" className="px-6 py-3">Unit</th>
                  <th scope="col" className="px-6 py-3">Issue</th>
                  <th scope="col" className="px-6 py-3">Reported</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((request) => (
                  <tr key={request.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="px-6 py-4 font-medium text-white">{request.unitAddress}</td>
                    <td className="px-6 py-4">{request.issue}</td>
                    <td className="px-6 py-4">{request.reportedDate}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full capitalize ${statusStyles[request.status]}`}>
                        {request.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">
            <h3 className="text-lg font-semibold">No Maintenance Requests</h3>
            <p className="mt-2">Create a new request to track maintenance issues.</p>
          </div>
        )}
      </div>
    </main>
  );
}