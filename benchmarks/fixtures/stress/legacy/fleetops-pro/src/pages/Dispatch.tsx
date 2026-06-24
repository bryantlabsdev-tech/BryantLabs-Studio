import { useState } from "react";
import { DispatchStatus } from "../types";

// Interface for a single dispatch job
interface DispatchJob {
  id: string;
  driver: string;
  vehicle: string;
  origin: string;
  destination: string;
  startTime: string;
  status: DispatchStatus;
}

// Mock data
const mockDispatchJobs: DispatchJob[] = [
  { id: "DJ001", driver: "John Doe", vehicle: "Truck 101", origin: "Warehouse A", destination: "Customer Site X", startTime: "2023-10-28 08:00", status: "In Progress" },
  { id: "DJ002", driver: "Jane Smith", vehicle: "Van 04", origin: "Warehouse B", destination: "Retail Store Y", startTime: "2023-10-28 09:30", status: "Scheduled" },
  { id: "DJ003", driver: "Carlos Ray", vehicle: "Truck 102", origin: "Port of LA", destination: "Distribution Center Z", startTime: "2023-10-27 14:00", status: "Completed" },
  { id: "DJ004", driver: "Emily White", vehicle: "Truck 201", origin: "Factory Q", destination: "Warehouse A", startTime: "2023-10-26 10:00", status: "Cancelled" },
];

const getStatusBadge = (status: DispatchStatus) => {
  const baseClasses = "px-2 py-1 text-xs font-semibold rounded-full";
  switch (status) {
    case "Scheduled":
      return `${baseClasses} bg-blue-500 text-blue-100`;
    case "In Progress":
      return `${baseClasses} bg-yellow-500 text-yellow-100`;
    case "Completed":
      return `${baseClasses} bg-green-500 text-green-100`;
    case "Cancelled":
      return `${baseClasses} bg-red-500 text-red-100`;
  }
};

const Dispatch = () => {
  const [dispatchJobs] = useState<DispatchJob[]>(mockDispatchJobs);

  return (
    <main className="flex-grow p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Dispatch</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded">
          New Dispatch
        </button>
      </div>

      <div className="panel-card">
        {dispatchJobs.length > 0 ? (
          <table className="w-full text-left">
            <thead className="border-b border-gray-700">
              <tr>
                <th className="p-3">Job ID</th>
                <th className="p-3">Driver</th>
                <th className="p-3">Vehicle</th>
                <th className="p-3">Route</th>
                <th className="p-3">Start Time</th>
                <th className="p-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {dispatchJobs.map((job) => (
                <tr key={job.id} className="border-b border-gray-800 hover:bg-gray-800">
                  <td className="p-3">{job.id}</td>
                  <td className="p-3">{job.driver}</td>
                  <td className="p-3">{job.vehicle}</td>
                  <td className="p-3">{job.origin} → {job.destination}</td>
                  <td className="p-3">{job.startTime}</td>
                  <td className="p-3"><span className={getStatusBadge(job.status)}>{job.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold">No dispatch jobs found.</h3>
            <p className="text-gray-400 mt-2">Create a new dispatch to get started.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Dispatch;