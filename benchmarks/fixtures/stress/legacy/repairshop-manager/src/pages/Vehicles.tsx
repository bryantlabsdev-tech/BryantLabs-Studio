import { useState } from "react";
import { EntityId } from "../types";

// NOTE: This type would typically be in `src/types.ts`
export interface Vehicle {
  id: EntityId;
  year: number;
  make: string;
  model: string;
  vin: string;
  customerId: EntityId;
  customerName: string; // denormalized for easy display
}

const mockVehicles: Vehicle[] = [
  { id: "v1", year: 2020, make: "Toyota", model: "Camry", vin: "123VIN456", customerId: "1", customerName: "John Doe" },
  { id: "v2", year: 2018, make: "Honda", model: "Civic", vin: "789VIN012", customerId: "2", customerName: "Jane Smith" },
  { id: "v3", year: 2022, make: "Ford", model: "F-150", vin: "345VIN678", customerId: "3", customerName: "Bob Johnson" },
  { id: "v4", year: 2019, make: "Tesla", model: "Model 3", vin: "901VIN234", customerId: "4", customerName: "Alice Williams" },
];


export default function Vehicles() {
  const [vehicles, _setVehicles] = useState<Vehicle[]>(mockVehicles);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">Vehicles</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg">
          Add Vehicle
        </button>
      </div>

      <div className="panel-card">
        {vehicles.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-600">
                <tr>
                  <th className="p-3">Vehicle</th>
                  <th className="p-3">Year</th>
                  <th className="p-3">VIN</th>
                  <th className="p-3">Owner</th>
                  <th className="p-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {vehicles.map((vehicle) => (
                  <tr key={vehicle.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="p-3 font-medium">{vehicle.make} {vehicle.model}</td>
                    <td className="p-3">{vehicle.year}</td>
                    <td className="p-3 font-mono text-sm">{vehicle.vin}</td>
                    <td className="p-3">{vehicle.customerName}</td>
                    <td className="p-3 text-right">
                      <button className="text-indigo-400 hover:text-indigo-300">
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-xl font-semibold">No Vehicles Found</h3>
            <p className="text-gray-400 mt-2">Get started by adding a new vehicle.</p>
          </div>
        )}
      </div>
    </div>
  );
}