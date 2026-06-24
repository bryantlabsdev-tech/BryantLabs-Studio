import { useState } from "react";
import { ArrowRightLeft } from "../components/IconStub";

// NOTE: In a real app, this type would live in src/types.ts
export interface StockMovement {
  id: string;
  productName: string;
  sku: string;
  type: "Inbound" | "Outbound" | "Adjustment" | "Transfer";
  quantityChange: number;
  reason: string;
  timestamp: string;
  referenceId: string;
}

const mockStockMovements: StockMovement[] = [
  {
    id: "sm_001",
    productName: "Ceramic Brake Pad Set",
    sku: "HW-CB-01",
    type: "Inbound",
    quantityChange: 100,
    reason: "Purchase Order Receipt",
    timestamp: "2024-07-25T10:30:00Z",
    referenceId: "PO-2024-001",
  },
  {
    id: "sm_002",
    productName: "NGK Spark Plug",
    sku: "HW-SP-04",
    type: "Outbound",
    quantityChange: -24,
    reason: "Sales Order",
    timestamp: "2024-07-25T11:15:00Z",
    referenceId: "SO-2024-152",
  },
  {
    id: "sm_003",
    productName: "Air Filter",
    sku: "HW-AF-12",
    type: "Adjustment",
    quantityChange: -2,
    reason: "Stock Count Correction",
    timestamp: "2024-07-24T17:00:00Z",
    referenceId: "SC-2024-Q3",
  },
  {
    id: "sm_004",
    productName: "Synthetic Motor Oil",
    sku: "HW-MO-07",
    type: "Transfer",
    quantityChange: -10,
    reason: "Warehouse A to B",
    timestamp: "2024-07-23T09:00:00Z",
    referenceId: "WT-2024-088",
  },
  {
    id: "sm_005",
    productName: "Wiper Blade Set",
    sku: "HW-WB-02",
    type: "Inbound",
    quantityChange: 50,
    reason: "Supplier Return",
    timestamp: "2024-07-22T14:45:00Z",
    referenceId: "RMA-2024-015",
  },
];

const typeColors: Record<StockMovement["type"], string> = {
  Inbound: "bg-green-500/20 text-green-400",
  Outbound: "bg-red-500/20 text-red-400",
  Adjustment: "bg-yellow-500/20 text-yellow-400",
  Transfer: "bg-blue-500/20 text-blue-400",
};

export default function StockMovements() {
  const [stockMovements] = useState<StockMovement[]>(mockStockMovements);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
      <div className="flex items-center">
        <h1 className="font-semibold text-lg md:text-2xl">Stock Movements</h1>
      </div>
      <div className="panel-card">
        {stockMovements.length > 0 ? (
          <table className="w-full text-sm text-left text-gray-400">
            <thead className="text-xs uppercase bg-gray-700 text-gray-400">
              <tr>
                <th scope="col" className="px-6 py-3">Timestamp</th>
                <th scope="col" className="px-6 py-3">Product</th>
                <th scope="col" className="px-6 py-3">Type</th>
                <th scope="col" className="px-6 py-3 text-center">Quantity</th>
                <th scope="col" className="px-6 py-3">Reason</th>
                <th scope="col" className="px-6 py-3">Reference</th>
              </tr>
            </thead>
            <tbody>
              {stockMovements.map((move) => (
                <tr key={move.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                  <td className="px-6 py-4">{new Date(move.timestamp).toLocaleString()}</td>
                  <td className="px-6 py-4 font-medium text-white">{move.productName} <span className="text-gray-500">({move.sku})</span></td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${typeColors[move.type]}`}>
                      {move.type}
                    </span>
                  </td>
                  <td className={`px-6 py-4 text-center font-bold ${move.quantityChange > 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {move.quantityChange > 0 ? `+${move.quantityChange}` : move.quantityChange}
                  </td>
                  <td className="px-6 py-4">{move.reason}</td>
                  <td className="px-6 py-4">{move.referenceId}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <ArrowRightLeft className="mx-auto h-12 w-12 text-gray-500" />
            <h3 className="mt-2 text-sm font-medium text-white">No stock movements</h3>
            <p className="mt-1 text-sm text-gray-400">Activity will appear here when stock levels change.</p>
          </div>
        )}
      </div>
    </main>
  );
}