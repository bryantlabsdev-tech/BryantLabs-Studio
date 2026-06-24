import { useState } from "react";
import type { DispatchStatus } from "../types";
import { MapPin, PlusCircle } from "../components/IconStub";

interface DispatchJob {
  id: string;
  jobDescription: string;
  driverName: string;
  vehicleId: string;
  startLocation: string;
  endLocation: string;
  startTime: string;
  status: DispatchStatus;
}

const mockDispatches: DispatchJob[] = [
  {
    id: "DJ001",
    jobDescription: "Deliver construction materials",
    driverName: "John Doe",
    vehicleId: "V001",
    startLocation: "Warehouse A",
    endLocation: "123 Main St",
    startTime: "2023-10-27 08:00",
    status: "In Progress",
  },
  {
    id: "DJ002",
    jobDescription: "Client pickup",
    driverName: "Jane Smith",
    vehicleId: "V003",
    startLocation: "456 Oak Ave",
    endLocation: "Client HQ",
    startTime: "2023-10-27 09:30",
    status: "Completed",
  },
  {
    id: "DJ003",
    jobDescription: "Inter-depot transfer",
    driverName: "Mike Johnson",
    vehicleId: "V002",
    startLocation: "Warehouse B",
    endLocation: "Warehouse C",
    startTime: "2023-10-28 10:00",
    status: "Pending",
  },
  {
    id: "DJ004",
    jobDescription: "Emergency equipment delivery",
    driverName: "John Doe",
    vehicleId: "V001",
    startLocation: "Warehouse A",
    endLocation: "789 Pine Ln",
    startTime: "2023-10-26 14:00",
    status: "Cancelled",
  },
];

const getStatusBadge = (status: DispatchStatus) => {
  const baseClasses = "px-2 py-1 text-xs font-semibold rounded-full";
  switch (status) {
    case "Pending":
      return <span className={`${baseClasses} bg-yellow-600 text-yellow-100`}>Pending</span>;
    case "In Progress":
      return <span className={`${baseClasses} bg-blue-600 text-blue-100`}>In Progress</span>;
    case "Completed":
      return <span className={`${baseClasses} bg-green-600 text-green-100`}>Completed</span>;
    case "Cancelled":
      return <span className={`${baseClasses} bg-red-600 text-red-100`}>Cancelled</span>;
    default:
      return <span className={`${baseClasses} bg-gray-600 text-gray-100`}>Unknown</span>;
  }
};

export default function Dispatch() {
  const [dispatches] = useState<DispatchJob[]>(mockDispatches);

  return (
    <main className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold flex items-center">
          <MapPin className="w-8 h-8 mr-2 text-blue-400" />
          Dispatch
        </h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">
          <PlusCircle className="w-5 h-5" />
          New Job
        </button>
      </div>

      <div className="panel-card bg-gray-800 p-4 rounded-lg">
        {dispatches.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <MapPin className="w-12 h-12 mx-auto mb-4" />
            <p className="text-lg">No dispatch jobs found.</p>
            <p>Click "New Job" to create one.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-700 text-gray-400">
                <tr>
                  <th className="p-3">Job ID</th>
                  <th className="p-3">Description</th>
                  <th className="p-3">Driver</th>
                  <th className="p-3">Vehicle</th>
                  <th className="p-3">Route</th>
                  <th className="p-3">Start Time</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {dispatches.map((job) => (
                  <tr key={job.id} className="hover:bg-gray-700/50">
                    <td className="p-3 font-mono text-sm">{job.id}</td>
                    <td className="p-3">{job.jobDescription}</td>
                    <td className="p-3">{job.driverName}</td>
                    <td className="p-3">{job.vehicleId}</td>
                    <td className="p-3">{job.startLocation} &rarr; {job.endLocation}</td>
                    <td className="p-3">{job.startTime}</td>
                    <td className="p-3">{getStatusBadge(job.status)}</td>
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