import { useState } from "react";
import { PlusCircle } from "../components/IconStub";

// NOTE: In a real app, this type would live in src/types.ts
export interface PurchaseOrder {
  id: string;
  supplierName: string;
  status: "Pending" | "Approved" | "Shipped" | "Delivered" | "Cancelled";
  orderDate: string;
  expectedDeliveryDate: string;
  totalAmount: number;
}

const mockPurchaseOrders: PurchaseOrder[] = [
  {
    id: "PO-2024-001",
    supplierName: "AutoParts Global",
    status: "Delivered",
    orderDate: "2024-07-15",
    expectedDeliveryDate: "2024-07-25",
    totalAmount: 1250.75,
  },
  {
    id: "PO-2024-002",
    supplierName: "EngineWorks Inc.",
    status: "Shipped",
    orderDate: "2024-07-18",
    expectedDeliveryDate: "2024-07-28",
    totalAmount: 3400.00,
  },
  {
    id: "PO-2024-003",
    supplierName: "Global Transmissions",
    status: "Approved",
    orderDate: "2024-07-20",
    expectedDeliveryDate: "2024-08-05",
    totalAmount: 780.50,
  },
  {
    id: "PO-2024-004",
    supplierName: "AutoParts Global",
    status: "Pending",
    orderDate: "2024-07-22",
    expectedDeliveryDate: "2024-08-01",
    totalAmount: 550.00,
  },
  {
    id: "PO-2024-005",
    supplierName: "Tire Masters",
    status: "Cancelled",
    orderDate: "2024-07-10",
    expectedDeliveryDate: "2024-07-20",
    totalAmount: 1800.00,
  },
];

const statusColors: Record<PurchaseOrder["status"], string> = {
  Pending: "bg-yellow-500/20 text-yellow-400",
  Approved: "bg-blue-500/20 text-blue-400",
  Shipped: "bg-indigo-500/20 text-indigo-400",
  Delivered: "bg-green-500/20 text-green-400",
  Cancelled: "bg-red-500/20 text-red-400",
};

export default function PurchaseOrders() {
  const [purchaseOrders] = useState<PurchaseOrder[]>(mockPurchaseOrders);

  return (
    <main className="flex flex-1 flex-col gap-4 p-4 md:gap-8 md:p-6">
      <div className="flex items-center">
        <h1 className="font-semibold text-lg md:text-2xl">Purchase Orders</h1>
        <button className="ml-auto flex items-center gap-2 rounded-md bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700">
          <PlusCircle className="h-4 w-4" />
          New Purchase Order
        </button>
      </div>
      <div className="panel-card">
        {purchaseOrders.length > 0 ? (
          <table className="w-full text-sm text-left text-gray-400">
            <thead className="text-xs uppercase bg-gray-700 text-gray-400">
              <tr>
                <th scope="col" className="px-6 py-3">Order ID</th>
                <th scope="col" className="px-6 py-3">Supplier</th>
                <th scope="col" className="px-6 py-3">Order Date</th>
                <th scope="col" className="px-6 py-3">Expected Delivery</th>
                <th scope="col" className="px-6 py-3">Status</th>
                <th scope="col" className="px-6 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {purchaseOrders.map((order) => (
                <tr key={order.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                  <td className="px-6 py-4 font-medium text-white whitespace-nowrap">{order.id}</td>
                  <td className="px-6 py-4">{order.supplierName}</td>
                  <td className="px-6 py-4">{order.orderDate}</td>
                  <td className="px-6 py-4">{order.expectedDeliveryDate}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${statusColors[order.status]}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    ${order.totalAmount.toFixed(2)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-400">No purchase orders found.</p>
            <p className="text-sm mt-2 text-gray-500">Create a new purchase order to get started.</p>
          </div>
        )}
      </div>
    </main>
  );
}