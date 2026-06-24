import { useState } from "react";
import { MaintenanceStatus } from "../types";

// Interface for a maintenance record
interface MaintenanceRecord {
  id: string;
  vehicle: string;
  issue: string;
  scheduledDate: string;
  status: MaintenanceStatus;
}

// Mock data
const mockMaintenanceRecords: MaintenanceRecord[] = [
  { id: "M001", vehicle: "Truck 101", issue: "Oil Change & Filter", scheduledDate: "2023-11-05", status: "Scheduled" },
  { id: "M002", vehicle: "Van 04", issue: "Brake Pad Replacement", scheduledDate: "2023-10-25", status: "In Progress" },
  { id: "M003", vehicle: "Truck 102", issue: "Tire Rotation", scheduledDate: "2023-10-20", status: "Completed" },
  { id: "M004", vehicle: "Truck 201", issue: "Engine Diagnostics", scheduledDate: "2023-11-10", status: "Scheduled" },
];

const getStatusBadge = (status: MaintenanceStatus) => {
  const baseClasses = "px-2 py-1 text-xs font-semibold rounded-full";
  switch (status) {
    case "Scheduled":
      return `${baseClasses} bg-blue-500 text-blue-100`;
    case "In Progress":
      return `${baseClasses} bg-yellow-500 text-yellow-100`;
    case "Completed":
      return `${baseClasses} bg-green-500 text-green-100`;
  }
};

const Maintenance = () => {
  const [maintenanceRecords] = useState<MaintenanceRecord[]>(mockMaintenanceRecords);

  return (
    <main className="flex-grow p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Maintenance</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded">
          Schedule Maintenance
        </button>
      </div>

      <div className="panel-card">
        {maintenanceRecords.length > 0 ? (
          <table className="w-full text-left">
            <thead className="border-b border-gray-700">
              <tr>
                <th className="p-3">Record ID</th>
                <th className="p-3">Vehicle</th>
                <th className="p-3">Issue Description</th>
                <th className="p-3">Scheduled Date</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {maintenanceRecords.map((record) => (
                <tr key={record.id} className="border-b border-gray-800 hover:bg-gray-800">
                  <td className="p-3">{record.id}</td>
                  <td className="p-3">{record.vehicle}</td>
                  <td className="p-3">{record.issue}</td>
                  <td className="p-3">{record.scheduledDate}</td>
                  <td className="p-3"><span className={getStatusBadge(record.status)}>{record.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold">No maintenance records found.</h3>
            <p className="text-gray-400 mt-2">Schedule new maintenance to see it here.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Maintenance;