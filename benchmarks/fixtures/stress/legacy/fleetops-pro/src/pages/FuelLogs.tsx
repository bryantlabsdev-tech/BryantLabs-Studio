import { useState } from "react";

// Interface for a single fuel log entry
interface FuelLog {
  id: string;
  vehicle: string;
  driver: string;
  date: string;
  gallons: number;
  cost: number;
  odometer: number;
}

// Mock data
const mockFuelLogs: FuelLog[] = [
  { id: "FL001", vehicle: "Truck 101", driver: "John Doe", date: "2023-10-27", gallons: 150, cost: 585.00, odometer: 125432 },
  { id: "FL002", vehicle: "Van 04", driver: "Jane Smith", date: "2023-10-27", gallons: 20, cost: 82.40, odometer: 45890 },
  { id: "FL003", vehicle: "Truck 102", driver: "Carlos Ray", date: "2023-10-26", gallons: 180, cost: 702.00, odometer: 210567 },
  { id: "FL004", vehicle: "Truck 101", driver: "John Doe", date: "2023-10-25", gallons: 145, cost: 569.85, odometer: 124888 },
];

const FuelLogs = () => {
  const [fuelLogs] = useState<FuelLog[]>(mockFuelLogs);

  // Helper to format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  return (
    <main className="flex-grow p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold">Fuel Logs</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded">
          New Fuel Log
        </button>
      </div>

      <div className="panel-card">
        {fuelLogs.length > 0 ? (
          <table className="w-full text-left">
            <thead className="border-b border-gray-700">
              <tr>
                <th className="p-3">Log ID</th>
                <th className="p-3">Vehicle</th>
                <th className="p-3">Driver</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Gallons</th>
                <th className="p-3 text-right">Total Cost</th>
                <th className="p-3 text-right">Odometer</th>
              </tr>
            </thead>
            <tbody>
              {fuelLogs.map((log) => (
                <tr key={log.id} className="border-b border-gray-800 hover:bg-gray-800">
                  <td className="p-3">{log.id}</td>
                  <td className="p-3">{log.vehicle}</td>
                  <td className="p-3">{log.driver}</td>
                  <td className="p-3">{log.date}</td>
                  <td className="p-3 text-right">{log.gallons.toFixed(2)}</td>
                  <td className="p-3 text-right">{formatCurrency(log.cost)}</td>
                  <td className="p-3 text-right">{log.odometer.toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold">No fuel logs found.</h3>
            <p className="text-gray-400 mt-2">Add a new fuel log to track fuel consumption.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default FuelLogs;