import { useState } from "react";
import type { VehicleStatus } from "../types";
import { Truck } from "../components/IconStub";

interface Vehicle {
  id: string;
  make: string;
  model: string;
  year: number;
  vin: string;
  status: VehicleStatus;
  currentDriver: string;
}

const mockVehicles: Vehicle[] = [
  {
    id: "V001",
    make: "Ford",
    model: "Transit",
    year: 2022,
    vin: "1FT...",
    status: "Active",
    currentDriver: "John Doe",
  },
  {
    id: "V002",
    make: "Mercedes-Benz",
    model: "Sprinter",
    year: 2021,
    vin: "W1K...",
    status: "In Shop",
    currentDriver: "N/A",
  },
  {
    id: "V003",
    make: "RAM",
    model: "ProMaster",
    year: 2023,
    vin: "3C6...",
    status: "Active",
    currentDriver: "Jane Smith",
  },
  {
    id: "V004",
    make: "Ford",
    model: "F-150",
    year: 2020,
    vin: "1FT...",
    status: "Inactive",
    currentDriver: "N/A",
  },
];

const getStatusBadge = (status: VehicleStatus) => {
  const styles: Record<VehicleStatus, string> = {
    Active: "bg-green-500/20 text-green-400",
    "In Shop": "bg-yellow-500/20 text-yellow-400",
    Inactive: "bg-gray-500/20 text-gray-400",
  };
  return (
    <span className={`px-2 py-1 text-xs font-medium rounded-full ${styles[status]}`}>
      {status}
    </span>
  );
};

export default function Vehicles() {
  const [vehicles] = useState<Vehicle[]>(mockVehicles);

  return (
    <main className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Vehicles</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg">
          Add Vehicle
        </button>
      </div>

      <div className="panel-card overflow-x-auto">
        {vehicles.length > 0 ? (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-gray-700">
                <th className="p-4">ID</th>
                <th className="p-4">Make & Model</th>
                <th className="p-4">Year</th>
                <th className="p-4">Status</th>
              </tr>
            </thead>
            <tbody>
              {vehicles.map((vehicle) => (
                <tr key={vehicle.id} className="border-b border-gray-700 last:border-b-0 hover:bg-gray-700/50">
                  <td className="p-4 font-mono text-sm">{vehicle.id}</td>
                  <td className="p-4">{`${vehicle.make} ${vehicle.model}`}</td>
                  <td className="p-4">{vehicle.year}</td>
                  <td className="p-4">{getStatusBadge(vehicle.status)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <Truck className="mx-auto h-12 w-12 text-gray-500" />
            <h3 className="mt-2 text-lg font-medium text-white">No vehicles found</h3>
            <p className="mt-1 text-sm text-gray-400">Get started by adding a new vehicle.</p>
          </div>
        )}
      </div>
    </main>
  );
}