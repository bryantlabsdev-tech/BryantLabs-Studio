import { useState } from "react";
import { Fuel, PlusCircle } from "../components/IconStub";

interface FuelLog {
  id: string;
  vehicleId: string;
  driverName: string;
  date: string;
  gallons: number;
  costPerGallon: number;
  totalCost: number;
  odometer: number;
}

const mockFuelLogs: FuelLog[] = [
  {
    id: "FL001",
    vehicleId: "V001",
    driverName: "John Doe",
    date: "2023-10-26",
    gallons: 20.5,
    costPerGallon: 4.50,
    totalCost: 92.25,
    odometer: 45210,
  },
  {
    id: "FL002",
    vehicleId: "V003",
    driverName: "Jane Smith",
    date: "2023-10-26",
    gallons: 15.2,
    costPerGallon: 4.55,
    totalCost: 69.16,
    odometer: 89345,
  },
  {
    id: "FL003",
    vehicleId: "V004",
    driverName: "Alex Ray",
    date: "2023-10-25",
    gallons: 35.0,
    costPerGallon: 5.10,
    totalCost: 178.50,
    odometer: 112500,
  },
  {
    id: "FL004",
    vehicleId: "V001",
    driverName: "John Doe",
    date: "2023-10-24",
    gallons: 18.9,
    costPerGallon: 4.48,
    totalCost: 84.67,
    odometer: 44850,
  },
];

export default function FuelLogs() {
  const [logs] = useState<FuelLog[]>(mockFuelLogs);

  return (
    <main className="p-4 sm:p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold flex items-center">
          <Fuel className="w-8 h-8 mr-2 text-green-400" />
          Fuel Logs
        </h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition">
          <PlusCircle className="w-5 h-5" />
          Log Fuel
        </button>
      </div>

      <div className="panel-card bg-gray-800 p-4 rounded-lg">
        {logs.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Fuel className="w-12 h-12 mx-auto mb-4" />
            <p className="text-lg">No fuel logs found.</p>
            <p>Click "Log Fuel" to add an entry.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-700 text-gray-400">
                <tr>
                  <th className="p-3">Date</th>
                  <th className="p-3">Vehicle</th>
                  <th className="p-3">Driver</th>
                  <th className="p-3">Odometer</th>
                  <th className="p-3">Gallons</th>
                  <th className="p-3">Total Cost</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {logs.map((log) => (
                  <tr key={log.id} className="hover:bg-gray-700/50">
                    <td className="p-3">{log.date}</td>
                    <td className="p-3">{log.vehicleId}</td>
                    <td className="p-3">{log.driverName}</td>
                    <td className="p-3">{log.odometer.toLocaleString()}</td>
                    <td className="p-3">{log.gallons.toFixed(2)}</td>
                    <td className="p-3">${log.totalCost.toFixed(2)}</td>
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