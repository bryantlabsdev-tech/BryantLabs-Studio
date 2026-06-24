import { useState } from "react";
import { PurchaseOrderStatus } from "../types";

interface PurchaseOrder {
  id: string;
  supplierName: string;
  orderDate: string;
  expectedDelivery: string;
  status: PurchaseOrderStatus;
  total: number;
}

const mockPurchaseOrders: PurchaseOrder[] = [
  { id: 'PO-2024-001', supplierName: 'Global Hardware Inc.', orderDate: '2024-07-15', expectedDelivery: '2024-08-01', status: 'ordered', total: 12500.00 },
  { id: 'PO-2024-002', supplierName: 'Electronix Direct', orderDate: '2024-07-18', expectedDelivery: '2024-07-25', status: 'shipped', total: 8200.50 },
  { id: 'PO-2024-003', supplierName: 'Global Hardware Inc.', orderDate: '2024-07-20', expectedDelivery: '2024-08-10', status: 'pending', total: 5500.00 },
  { id: 'PO-2024-004', supplierName: 'Office Supplies Co.', orderDate: '2024-06-30', expectedDelivery: '2024-07-07', status: 'received', total: 1500.75 },
  { id: 'PO-2024-005', supplierName: 'Electronix Direct', orderDate: '2024-06-15', expectedDelivery: '2024-06-22', status: 'cancelled', total: 4300.00 },
];

const statusStyles: Record<PurchaseOrderStatus, string> = {
  pending: "bg-yellow-500/20 text-yellow-400",
  ordered: "bg-blue-500/20 text-blue-400",
  shipped: "bg-cyan-500/20 text-cyan-400",
  received: "bg-green-500/20 text-green-400",
  cancelled: "bg-red-500/20 text-red-400",
};

const StatusBadge = ({ status }: { status: PurchaseOrderStatus }) => (
  <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusStyles[status]}`}>
    {status.charAt(0).toUpperCase() + status.slice(1)}
  </span>
);

export default function PurchaseOrders() {
  const [purchaseOrders] = useState<PurchaseOrder[]>(mockPurchaseOrders);

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-semibold text-white">Purchase Orders</h2>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg">
          Create New PO
        </button>
      </div>

      <div className="panel-card bg-gray-800 border border-gray-700 rounded-lg p-4">
        {purchaseOrders.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-400">
              <thead className="text-xs text-gray-300 uppercase bg-gray-700/50">
                <tr>
                  <th scope="col" className="px-6 py-3">PO Number</th>
                  <th scope="col" className="px-6 py-3">Supplier</th>
                  <th scope="col" className="px-6 py-3">Order Date</th>
                  <th scope="col" className="px-6 py-3">Expected Delivery</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3 text-right">Total</th>
                </tr>
              </thead>
              <tbody>
                {purchaseOrders.map((po) => (
                  <tr key={po.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="px-6 py-4 font-mono text-white">{po.id}</td>
                    <td className="px-6 py-4 text-white">{po.supplierName}</td>
                    <td className="px-6 py-4">{po.orderDate}</td>
                    <td className="px-6 py-4">{po.expectedDelivery}</td>
                    <td className="px-6 py-4"><StatusBadge status={po.status} /></td>
                    <td className="px-6 py-4 text-right font-mono text-white">${po.total.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-white">No Purchase Orders Found</h3>
            <p className="text-gray-400 mt-2">Get started by creating a new purchase order.</p>
          </div>
        )}
      </div>
    </main>
  );
}