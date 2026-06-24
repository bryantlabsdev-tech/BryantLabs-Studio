import { useState } from "react";
import type { MaintenanceStatus } from "../types";
import { Wrench, PlusCircle } from "../components/IconStub";

interface MaintenanceRecord {
  id: string;
  vehicleId: string;
  serviceType: string;
  scheduledDate: string;
  completedDate: string | null;
  cost: number | null;
  status: MaintenanceStatus;
}

const mockMaintenanceRecords: MaintenanceRecord[] = [
  {
    id: "M001",
    vehicleId: "V002",
    serviceType: "Oil Change",
    scheduledDate: "2023-10-25",
    completedDate: "2023-10-25",
    cost: 150.00,
    status: "Completed",
  },
  {
    id: "M002",
    vehicleId: "V005",
    serviceType: "Brake Repair",
    scheduledDate: "2023-10-28",
    completedDate: null,
    cost: null,
    status: "In Progress",
  },
  {
    id: "M003",
    vehicleId: "V001",
    serviceType: "Tire Rotation",
    scheduledDate: "2023-11-05",
    completedDate: null,
    cost: null,
    status: "Scheduled",
  },
  {
    id: "M004",
    vehicleId: "V007",
    serviceType: "Engine Diagnostic",
    scheduledDate: "2023-10-20",
    completedDate: "2023-10-21",
    cost: 350.50,
    status: "Completed",
  },
];

const getStatusBadge = (status: MaintenanceStatus) => {
  const baseClasses = "px-2 py-1 text-xs font-semibold rounded-full";
  switch (status) {
    case "Scheduled":
      return <span className={`${baseClasses} bg-yellow-600 text-yellow-100`}>Scheduled</span>;
    case "In Progress":
      return <span className={`${baseClasses} bg-blue-600 text-blue-100`}>In Progress</span>;
    case "Completed":
      return <span className={`${baseClasses} bg-green-600 text-green-100`}>Completed</span>;
    default:
      return <span className={`${baseClasses} bg-gray-600 text-gray-100`}>Unknown</span>;
  }
};

export default function Maintenance() {
  const [records] = useState<MaintenanceRecord[]>(mockMaintenanceRecords);

  return (
    <main className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold flex items-center">
          <Wrench className="w-8 h-8 mr-2 text-yellow-400" />
          Maintenance
        </h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">
          <PlusCircle className="w-5 h-5" />
          Schedule Service
        </button>
      </div>

      <div className="panel-card bg-gray-800 p-4 rounded-lg">
        {records.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Wrench className="w-12 h-12 mx-auto mb-4" />
            <p className="text-lg">No maintenance records found.</p>
            <p>Click "Schedule Service" to create one.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-700 text-gray-400">
                <tr>
                  <th className="p-3">Record ID</th>
                  <th className="p-3">Vehicle</th>
                  <th className="p-3">Service Type</th>
                  <th className="p-3">Scheduled Date</th>
                  <th className="p-3">Cost</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {records.map((record) => (
                  <tr key={record.id} className="hover:bg-gray-700/50">
                    <td className="p-3 font-mono text-sm">{record.id}</td>
                    <td className="p-3">{record.vehicleId}</td>
                    <td className="p-3">{record.serviceType}</td>
                    <td className="p-3">{record.scheduledDate}</td>
                    <td className="p-3">{record.cost ? `$${record.cost.toFixed(2)}` : 'N/A'}</td>
                    <td className="p-3">{getStatusBadge(record.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}