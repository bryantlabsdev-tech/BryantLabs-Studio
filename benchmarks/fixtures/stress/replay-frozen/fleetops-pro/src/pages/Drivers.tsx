import { useState } from "react";
import type { DriverStatus } from "../types";
import { UserCircle } from "../components/IconStub";

interface Driver {
  id: string;
  name: string;
  licenseNumber: string;
  contact: string;
  assignedVehicle: string;
  status: DriverStatus;
}

const mockDrivers: Driver[] = [
  {
    id: "D001",
    name: "John Doe",
    licenseNumber: "A123-456-789",
    contact: "555-1234",
    assignedVehicle: "V001",
    status: "Active",
  },
  {
    id: "D002",
    name: "Jane Smith",
    licenseNumber: "B987-654-321",
    contact: "555-5678",
    assignedVehicle: "V003",
    status: "Active",
  },
  {
    id: "D003",
    name: "Sam Wilson",
    licenseNumber: "C456-123-789",
    contact: "555-9012",
    assignedVehicle: "N/A",
    status: "On Leave",
  },
  {
    id: "D004",
    name: "Emily Brown",
    licenseNumber: "D789-321-654",
    contact: "555-3456",
    assignedVehicle: "N/A",
    status: "Terminated",
  },
];

const getStatusBadge = (status: DriverStatus) => {
  const styles: Record<DriverStatus, string> = {
    Active: "bg-green-500/20 text-green-400",
    "On Leave": "bg-yellow-500/20 text-yellow-400",
    Terminated: "bg-red-500/20 text-red-400",
  };
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status]}`}>
      {status}
    </span>
  );
};

export default function Drivers() {
  const [drivers] = useState<Driver[]>(mockDrivers);

  return (
    <main className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Drivers</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg">
          Add Driver
        </button>
      </div>

      <div className="panel-card overflow-x-auto">
        {drivers.length > 0 ? (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="p-4">Name</th>
                <th className="p-4">Contact</th>
                <th className="p-4">Assigned Vehicle</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {drivers.map((driver) => (
                <tr key={driver.id} className="border-b border-gray-700 last:border-b-0 hover:bg-gray-700/50">
                  <td className="p-4 font-medium">{driver.name}</td>
                  <td className="p-4">{driver.contact}</td>
                  <td className="p-4 font-mono text-sm">{driver.assignedVehicle}</td>
                  <td className="p-4">{getStatusBadge(driver.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <UserCircle className="mx-auto h-12 w-12 text-gray-500" />
            <h3 className="mt-2 text-lg font-medium text-white">No drivers found</h3>
            <p className="mt-1 text-sm text-gray-400">Get started by adding a new driver.</p>
          </div>
        )}
      </div>
    </main>
  );
}