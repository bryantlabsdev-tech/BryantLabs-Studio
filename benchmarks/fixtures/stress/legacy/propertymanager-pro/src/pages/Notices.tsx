import { useState } from "react";
import type { Notice, NoticeStatus } from "../types";

const mockNotices: Array<Record<string, unknown>> = [
  { id: 'n1', tenantName: 'Alice Johnson', unitAddress: '123 Maple St, #4B', type: 'maintenance_entry', sentDate: '2024-08-01', status: 'delivered', title: 'Plumbing Work Notification',
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
  recipientId: "id"},
  { id: 'n2', tenantName: 'Bob Williams', unitAddress: '456 Oak Ave, #12', type: 'late_rent', sentDate: '2024-07-05', status: 'viewed', title: 'Late Rent Reminder',
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
  recipientId: "id"},
  { id: 'n3', tenantName: 'Charlie Brown', unitAddress: '789 Pine Ln, #1A', type: 'lease_violation', sentDate: '2024-07-22', status: 'sent', title: 'Noise Complaint Warning' },
  { id: 'n4', tenantName: 'Diana Prince', unitAddress: '101 Elm Ct, #2C', type: 'general', sentDate: '2024-06-30', status: 'viewed', title: 'Quarterly Newsletter' },
];

const getStatusBadgeClasses = (status: NoticeStatus) => {
  switch (status) {
    case 'sent':
      return 'bg-yellow-500/20 text-yellow-300';
    case 'delivered':
      return 'bg-blue-500/20 text-blue-300';
    case 'viewed':
      return 'bg-green-500/20 text-green-300';
    default:
      return 'bg-gray-500/20 text-gray-300';
  }
};

const getNoticeTypeLabel = (type: Notice['type']) => {
    const labels: Record<string, string> = {
        late_rent: 'Late Rent',
        lease_violation: 'Lease Violation',
        maintenance_entry: 'Maintenance Entry',
        general: 'General'
    };
    return labels[type];
}

const Notices = () => {
  const [notices] = useState(mockNotices as unknown as Notice[]);

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Notices</h1>
        <button className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500">
          Create Notice
        </button>
      </div>

      <div className="panel-card overflow-x-auto">
        {notices.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Tenant</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Title</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Type</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Date Sent</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="bg-gray-800/50 divide-y divide-gray-700">
              {notices.map((notice) => (
                <tr key={notice.id}>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-white">{notice.tenantName}</div>
                    <div className="text-sm text-gray-400">{notice.unitAddress}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{notice.title}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{getNoticeTypeLabel(notice.type)}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{new Date(notice.sentDate).toLocaleDateString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                                        <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClasses((notice.status ?? "sent") as NoticeStatus)}`}>
                      {notice.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <a href="#" className="text-indigo-400 hover:text-indigo-300">View</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-white">No Notices Sent</h3>
            <p className="mt-1 text-sm text-gray-400">Create and send a new notice to get started.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Notices;