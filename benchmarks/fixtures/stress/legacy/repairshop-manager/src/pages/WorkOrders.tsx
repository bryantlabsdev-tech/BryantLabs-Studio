import { useState } from "react";
import { EntityId, WorkOrderStatus } from "../types";
import { PlusIcon } from "../components/IconStub";
// This type would typically be in `src/types.ts`
export interface WorkOrder {
  id: EntityId;
  customerName: string;
  vehicle: string;
  status: WorkOrderStatus;
  createdDate: string;
  total: number;
}

const mockWorkOrders: WorkOrder[] = [
  { id: "WO-001", customerName: "John Doe", vehicle: "2020 Toyota Camry", status: "In Progress", createdDate: "2023-10-26", total: 450.00 },
  { id: "WO-002", customerName: "Jane Smith", vehicle: "2018 Honda Civic", status: "Awaiting Parts", createdDate: "2023-10-25", total: 1200.50 },
  { id: "WO-003", customerName: "Bob Johnson", vehicle: "2022 Ford F-150", status: "Pending", createdDate: "2023-10-27", total: 85.00 },
  { id: "WO-004", customerName: "Alice Williams", vehicle: "2019 Subaru Outback", status: "Completed", createdDate: "2023-10-20", total: 620.75 },
  { id: "WO-005", customerName: "John Doe", vehicle: "2021 Tesla Model 3", status: "Cancelled", createdDate: "2023-10-18", total: 0.00 },
];

const getStatusBadgeClass = (status: WorkOrderStatus): string => {
  const baseClass = "px-2 py-1 text-xs font-medium rounded-full";
  switch (status) {
    case 'Pending': return `${baseClass} bg-yellow-500/20 text-yellow-400`;
    case 'In Progress': return `${baseClass} bg-blue-500/20 text-blue-400`;
    case 'Awaiting Parts': return `${baseClass} bg-orange-500/20 text-orange-400`;
    case 'Completed': return `${baseClass} bg-green-500/20 text-green-400`;
    case 'Cancelled': return `${baseClass} bg-gray-500/20 text-gray-400`;
    default: return baseClass;
  }
};

export default function WorkOrders() {
  const [workOrders] = useState<WorkOrder[]>(mockWorkOrders);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">Work Orders</h1>
        <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors">
          <PlusIcon className="h-5 w-5" />
          New Work Order
        </button>
      </div>

      <div className="panel-card bg-gray-800/50 border border-gray-700 rounded-lg">
        <div className="p-4 border-b border-gray-700">
          <input
            type="text"
            placeholder="Search work orders..."
            className="w-full sm:w-1/3 bg-gray-900 border border-gray-700 rounded-md py-2 px-4 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        {workOrders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-700 text-sm text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Order ID</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Vehicle</th>
                  <th className="px-4 py-3 font-medium">Date</th>
                  <th className="px-4 py-3 font-medium">Total</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {workOrders.map((wo) => (
                  <tr key={wo.id} className="hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-mono text-sm text-indigo-400">{wo.id}</td>
                    <td className="px-4 py-3">{wo.customerName}</td>
                    <td className="px-4 py-3">{wo.vehicle}</td>
                    <td className="px-4 py-3">{wo.createdDate}</td>
                    <td className="px-4 py-3 text-right">${wo.total.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={getStatusBadgeClass(wo.status)}>{wo.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-gray-300">No Work Orders Found</h3>
            <p className="text-gray-500 mt-1">Get started by creating a new work order.</p>
          </div>
        )}
      </div>
    </div>
  );
}