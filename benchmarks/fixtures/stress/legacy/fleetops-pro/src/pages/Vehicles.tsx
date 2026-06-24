import { useState } from "react";
import { VehicleStatus } from "../types";

interface Vehicle {
  id: string;
  name: string;
  makeModel: string;
  licensePlate: string;
  status: VehicleStatus;
}

const mockVehicles: Vehicle[] = [
  { id: "V001", name: "Truck 101", makeModel: "Freightliner Cascadia", licensePlate: "FL-5829", status: "Active" },
  { id: "V002", name: "Van 04", makeModel: "Ford Transit", licensePlate: "MA-123B", status: "In Shop" },
  { id: "V003", name: "Truck 102", makeModel: "Volvo VNL 860", licensePlate: "FL-9817", status: "Active" },
  { id: "V004", name: "Pickup 01", makeModel: "Ford F-150", licensePlate: "MA-X451", status: "Inactive" },
];

const getStatusBadgeClasses = (status: VehicleStatus) => {
  switch (status) {
    case "Active":
      return "bg-green-200 text-green-800";
    case "In Shop":
      return "bg-yellow-200 text-yellow-800";
    case "Inactive":
      return "bg-gray-200 text-gray-800";
    default:
      return "bg-gray-500 text-white";
  }
};

const Vehicles = () => {
  const [vehicles, _setVehicles] = useState<Vehicle[]>(mockVehicles);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Vehicles</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg">
          Add Vehicle
        </button>
      </div>

      <div className="panel-card overflow-x-auto">
        {vehicles.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Vehicle</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Make/Model</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">License Plate</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
              </tr>
            </thead>
            <tbody className="bg-gray-800 divide-y divide-gray-700">
              {vehicles.map((vehicle) => (
                <tr key={vehicle.id} className="hover:bg-gray-700/50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{vehicle.name}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{vehicle.makeModel}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{vehicle.licensePlate}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClasses(vehicle.status)}`}>
                      {vehicle.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-white">No vehicles found</h3>
            <p className="mt-1 text-sm text-gray-400">Get started by adding a new vehicle.</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default Vehicles;