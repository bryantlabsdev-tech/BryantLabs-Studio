import { useState } from "react";
import { StockMovementType } from "../types";

interface StockMovement {
  id: string;
  date: string;
  productSku: string;
  productName: string;
  type: StockMovementType;
  quantity: number;
  fromLocation?: string;
  toLocation?: string;
}

const mockMovements: StockMovement[] = [
  { id: 'SM-001', date: '2024-07-21', productSku: 'HW-MNT-01', productName: 'Mounting Bracket', type: 'inbound', quantity: 100, fromLocation: 'Supplier A', toLocation: 'Warehouse A' },
  { id: 'SM-002', date: '2024-07-21', productSku: 'EL-CAB-05', productName: 'USB-C Cable 5m', type: 'outbound', quantity: 50, fromLocation: 'Warehouse A', toLocation: 'Customer XYZ' },
  { id: 'SM-003', date: '2024-07-20', productSku: 'HW-SCR-25', productName: 'Screw Pack M5', type: 'adjustment', quantity: -5, fromLocation: 'Shelf 1-B', toLocation: 'Damaged Goods' },
  { id: 'SM-004', date: '2024-07-19', productSku: 'SW-LIC-01', productName: 'Software License', type: 'outbound', quantity: 1, fromLocation: 'Digital Vault', toLocation: 'Customer ABC' },
  { id: 'SM-005', date: '2024-07-18', productSku: 'EL-BAT-AA', productName: 'AA Battery 4-Pack', type: 'inbound', quantity: 500, fromLocation: 'Supplier B', toLocation: 'Warehouse B' },
];

const typeStyles: Record<StockMovementType, string> = {
  inbound: "bg-green-500/20 text-green-400",
  outbound: "bg-red-500/20 text-red-400",
  adjustment: "bg-gray-500/20 text-gray-400",
};

const TypeBadge = ({ type }: { type: StockMovementType }) => (
  <span className={`px-2 py-1 text-xs font-medium rounded-full ${typeStyles[type]}`}>
    {type.charAt(0).toUpperCase() + type.slice(1)}
  </span>
);

export default function StockMovements() {
  const [movements] = useState<StockMovement[]>(mockMovements);

  return (
    <main className="flex-1 p-6 overflow-auto">
      <h2 className="text-2xl font-semibold text-white mb-6">Stock Movements</h2>

      <div className="panel-card bg-gray-800 border border-gray-700 rounded-lg p-4">
        {movements.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-400">
              <thead className="text-xs text-gray-300 uppercase bg-gray-700/50">
                <tr>
                  <th scope="col" className="px-6 py-3">Date</th>
                  <th scope="col" className="px-6 py-3">Product</th>
                  <th scope="col" className="px-6 py-3">Type</th>
                  <th scope="col" className="px-6 py-3 text-center">Quantity</th>
                  <th scope="col" className="px-6 py-3">From</th>
                  <th scope="col" className="px-6 py-3">To</th>
                </tr>
              </thead>
              <tbody>
                {movements.map((m) => (
                  <tr key={m.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="px-6 py-4">{m.date}</td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{m.productName}</div>
                      <div className="font-mono text-xs text-gray-500">{m.productSku}</div>
                    </td>
                    <td className="px-6 py-4"><TypeBadge type={m.type} /></td>
                    <td className="px-6 py-4 text-center font-mono text-white">{m.quantity > 0 ? `+${m.quantity}` : m.quantity}</td>
                    <td className="px-6 py-4">{m.fromLocation || 'N/A'}</td>
                    <td className="px-6 py-4">{m.toLocation || 'N/A'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-white">No Stock Movements Recorded</h3>
            <p className="text-gray-400 mt-2">All inventory movements will be listed here.</p>
          </div>
        )}
      </div>
    </main>
  );
}