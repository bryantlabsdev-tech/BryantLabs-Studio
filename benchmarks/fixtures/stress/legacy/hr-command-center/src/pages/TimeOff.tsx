import { useState } from "react";
import type { TimeOffStatus } from '../types';

interface TimeOffRequest {
  id: string;
  employeeName: string;
  leaveType: 'Vacation' | 'Sick Leave' | 'Personal';
  startDate: string;
  endDate: string;
  status: TimeOffStatus;
}

const mockRequests: TimeOffRequest[] = [
  { id: '1', employeeName: 'Alice Johnson', leaveType: 'Vacation', startDate: '2023-11-20', endDate: '2023-11-24', status: 'Pending' },
  { id: '2', employeeName: 'Bob Smith', leaveType: 'Sick Leave', startDate: '2023-10-10', endDate: '2023-10-11', status: 'Approved' },
  { id: '3', employeeName: 'Charlie Brown', leaveType: 'Vacation', startDate: '2023-12-22', endDate: '2024-01-02', status: 'Pending' },
  { id: '4', employeeName: 'Diana Prince', leaveType: 'Personal', startDate: '2023-09-15', endDate: '2023-09-15', status: 'Rejected' },
];

const StatusBadge = ({ status }: { status: TimeOffStatus }) => {
  const statusClasses: Record<TimeOffStatus, string> = {
    Pending: 'bg-yellow-600 text-yellow-100',
    Approved: 'bg-green-600 text-green-100',
    Rejected: 'bg-red-600 text-red-100',
  };
  return <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusClasses[status]}`}>{status}</span>;
};

export default function TimeOff() {
  const [requests, setRequests] = useState(mockRequests);

  const handleUpdateStatus = (id: string, newStatus: TimeOffStatus) => {
    setRequests(current => current.map(req => req.id === id ? { ...req, status: newStatus } : req));
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Time Off Requests</h2>

      <div className="panel-card bg-gray-800 rounded-lg shadow-md overflow-hidden">
        {requests.length > 0 ? (
          <table className="w-full text-left">
            <thead className="bg-gray-700/50">
              <tr>
                <th className="p-4 text-sm font-semibold">Employee</th>
                <th className="p-4 text-sm font-semibold">Leave Type</th>
                <th className="p-4 text-sm font-semibold">Dates</th>
                <th className="p-4 text-sm font-semibold">Status</th>
                <th className="p-4 text-sm font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-700">
              {requests.map((req) => (
                <tr key={req.id} className="hover:bg-gray-700/50">
                  <td className="p-4">{req.employeeName}</td>
                  <td className="p-4">{req.leaveType}</td>
                  <td className="p-4">{req.startDate} - {req.endDate}</td>
                  <td className="p-4"><StatusBadge status={req.status} /></td>
                  <td className="p-4 space-x-2">
                    {req.status === 'Pending' && (
                      <>
                        <button onClick={() => handleUpdateStatus(req.id, 'Approved')} className="text-green-400 hover:text-green-300">Approve</button>
                        <button onClick={() => handleUpdateStatus(req.id, 'Rejected')} className="text-red-400 hover:text-red-300">Reject</button>
                      </>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center p-12">
            <h3 className="text-lg font-medium">No Time Off Requests</h3>
            <p className="text-gray-400 mt-2">There are no current time off requests to display.</p>
          </div>
        )}
      </div>
    </div>
  );
}