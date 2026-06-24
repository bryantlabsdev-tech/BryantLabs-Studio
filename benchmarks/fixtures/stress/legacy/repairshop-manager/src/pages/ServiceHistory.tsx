import { useState } from "react";
import { ServiceRecord } from "../types";

const mockServiceHistory: ServiceRecord[] = [
  { id: "WO-001", vehicle: "2020 Toyota Camry", customerName: "John Doe", serviceDate: "2023-10-15", servicesPerformed: "Oil change, Tire rotation", total: 125.50,
  notes: "",
  createdAt: new Date().toISOString().slice(0, 10),
},
  { id: "WO-002", vehicle: "2018 Ford F-150", customerName: "Jane Smith", serviceDate: "2023-10-12", servicesPerformed: "Brake pad replacement", total: 450.00,
  notes: "",
  createdAt: new Date().toISOString().slice(0, 10),
},
  { id: "WO-003", vehicle: "2022 Honda Civic", customerName: "Bob Johnson", serviceDate: "2023-10-10", servicesPerformed: "Annual inspection", total: 80.00,
  notes: "",
  createdAt: new Date().toISOString().slice(0, 10),
},
  { id: "WO-004", vehicle: "2020 Toyota Camry", customerName: "John Doe", serviceDate: "2023-05-20", servicesPerformed: "Transmission fluid change", total: 210.75,
  notes: "",
  createdAt: new Date().toISOString().slice(0, 10),
},
];

export default function ServiceHistory() {
  const [history] = useState<ServiceRecord[]>(mockServiceHistory);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredHistory = history.filter(record =>
    (record.vehicle ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (record.customerName ?? "").toLowerCase().includes(searchTerm.toLowerCase()) ||
    (record.servicesPerformed ?? "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className="flex-1 p-6 lg:p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Service History</h1>
      </div>

      <div className="panel-card">
        <div className="p-4 border-b border-gray-700">
          <input
            type="text"
            placeholder="Search by vehicle, customer, or service..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-md px-3 py-2 bg-gray-900 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        {filteredHistory.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-700">
                <tr>
                  <th className="p-4">Date</th>
                  <th className="p-4">Vehicle</th>
                  <th className="p-4">Customer</th>
                  <th className="p-4">Services</th>
                  <th className="p-4 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {filteredHistory.map((record) => (
                  <tr key={record.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="p-4">{record.serviceDate}</td>
                    <td className="p-4 font-medium">{record.vehicle}</td>
                    <td className="p-4 text-gray-300">{record.customerName}</td>
                    <td className="p-4 text-gray-300">{record.servicesPerformed}</td>
                    <td className="p-4 text-right font-mono">${(record.total ?? 0).toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">
            <h3 className="text-xl font-semibold">No Service History Found</h3>
            <p className="mt-2 text-sm">
              {searchTerm ? `Your search for "${searchTerm}" returned no results.` : "There are no service records to display."}
            </p>
          </div>
        )}
      </div>
    </main>
  );
}