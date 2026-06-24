import { useState } from "react";
import { DriverStatus } from "../types";

interface Driver {
  id: string;
  name: string;
  phone: string;
  assignedVehicle: string | null;
  status: DriverStatus;
}

const mockDrivers: Driver[] = [
  { id: "D001", name: "John Doe", phone: "555-123-4567", assignedVehicle: "Truck 101", status: "Active" },
  { id: "D002", name: "Jane Smith", phone: "555-987-6543", assignedVehicle: "Van 04", status: "Active" },
  { id: "D003", name: "Mike Johnson", phone: "555-555-1212", assignedVehicle: null, status: "On Leave" },
  { id: "D004", name: "Emily Davis", phone: "555-345-6789", assignedVehicle: null, status: "Terminated" },
];

const getStatusBadgeClasses = (status: DriverStatus) => {
  switch (status) {
    case "Active":
      return "bg-green-200 text-green-800";
    case "On Leave":
      return "bg-blue-200 text-blue-800";
    case "Terminated":
      return "bg-red-200 text-red-800";
    default:
      return "bg-gray-500 text-white";
  }
};

const Drivers = () => {
  const [drivers, _setDrivers] = useState<Driver[]>(mockDrivers);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Drivers</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg">
          Add Driver
        </button>
      </div>

      <div className="panel-card overflow-x-auto">
        {drivers.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Name</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Phone</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Assigned Vehicle</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {drivers.map((driver) => (
                <tr key={driver.id} className="hover:bg-gray-700/50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{driver.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{driver.phone}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{driver.assignedVehicle || "N/A"}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClasses(driver.status)}`}>
                      {driver.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-white">No drivers found</h3>
            <p className="mt-1 text-sm text-gray-400">Get started by adding a new driver.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Drivers;