import { useState } from "react";
import { PlusIcon } from "../components/IconStub";
import { InventoryPart } from "../types";

const mockParts: InventoryPart[] = [
  { id: "P1", partNumber: "123-OIL-FIL", name: "Oil Filter", supplier: "OEM Parts Inc.", quantity: 25, price: 15.99 },
  { id: "P2", partNumber: "456-BRK-PAD", name: "Brake Pads (Set)", supplier: "Brake Masters", quantity: 8, price: 79.99 },
  { id: "P3", partNumber: "789-SPK-PLG", name: "Spark Plug", supplier: "Sparky's", quantity: 150, price: 8.50 },
  { id: "P4", partNumber: "101-AIR-FIL", name: "Air Filter", supplier: "OEM Parts Inc.", quantity: 3, price: 22.00 },
  { id: "P5", partNumber: "202-BAT-TERY", name: "Car Battery", supplier: "PowerCell", quantity: 0, price: 189.99 },
];

const getStockStatus = (quantity: number) => {
  if (quantity === 0) return { text: 'Out of Stock', className: 'bg-red-500/20 text-red-400' };
  if (quantity < 10) return { text: 'Low Stock', className: 'bg-yellow-500/20 text-yellow-400' };
  return { text: 'In Stock', className: 'bg-green-500/20 text-green-400' };
};

export default function PartsInventory() {
  const [parts] = useState<InventoryPart[]>(mockParts);
  const [searchTerm, setSearchTerm] = useState("");

  const filteredParts = parts.filter(part =>
    part.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (part.partNumber ?? "").toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <main className="flex-1 p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <h1 className="text-3xl font-bold">Parts Inventory</h1>
        <button className="flex items-center gap-2 px-4 py-2 text-white bg-indigo-600 rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900">
          <PlusIcon className="w-5 h-5" />
          <span>Add Part</span>
        </button>
      </div>

      <div className="panel-card">
        <div className="p-4 border-b border-gray-700">
          <input
            type="text"
            placeholder="Search by part name or number..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full max-w-sm px-3 py-2 bg-gray-900 border border-gray-700 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>
        {filteredParts.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-700">
                <tr>
                  <th className="p-4">Part #</th>
                  <th className="p-4">Name</th>
                  <th className="p-4">Stock Status</th>
                  <th className="p-4 text-right">Qty</th>
                  <th className="p-4 text-right">Price</th>
                </tr>
              </thead>
              <tbody>
                {filteredParts.map((part) => {
                  if (part.quantity == null) return;
                  const status = getStockStatus(part.quantity);
                  return (
                    <tr key={part.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="p-4 font-mono text-sm text-gray-400">{part.partNumber}</td>
                      <td className="p-4 font-medium">{part.name}</td>
                      <td className="p-4">
                        <span className={`px-2 py-1 text-xs font-medium rounded-full ${status.className}`}>{status.text}</span>
                      </td>
                      <td className="p-4 text-right font-medium">{part.quantity}</td>
                      <td className="p-4 text-right font-mono">${(part.price ?? 0).toFixed(2)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">
            <h3 className="text-xl font-semibold">No Parts Found</h3>
            <p className="mt-2 text-sm">Your search for "{searchTerm}" did not return any results.</p>
          </div>
        )}
      </div>
    </main>
  );
}