import { useState } from "react";
import { OrderStatus } from '../types';

interface OrderItem {
  id: number;
  name: string;
  quantity: number;
}

interface Order {
  id: number;
  tableNumber: number;
  items: OrderItem[];
  total: number;
  status: OrderStatus;
  timestamp: string;
}

const mockOrders: Order[] = [
  { id: 101, tableNumber: 2, items: [{ id: 2, name: 'Spaghetti Carbonara', quantity: 2 }], total: 31.00, status: 'Served', timestamp: new Date().toISOString() },
  { id: 102, tableNumber: 5, items: [{ id: 1, name: 'Bruschetta', quantity: 1 }], total: 8.99, status: 'Preparing', timestamp: new Date().toISOString() },
  { id: 103, tableNumber: 3, items: [], total: 112.50, status: 'Paid', timestamp: new Date().toISOString() },
  { id: 104, tableNumber: 7, items: [], total: 45.75, status: 'Pending', timestamp: new Date().toISOString() },
];

const statusColorMap: Record<OrderStatus, string> = {
  Pending: 'bg-yellow-500 text-yellow-100',
  Preparing: 'bg-blue-500 text-blue-100',
  Served: 'bg-green-500 text-green-100',
  Paid: 'bg-gray-500 text-gray-100',
};

const Orders = () => {
  const [orders] = useState<Order[]>(mockOrders);

  return (
    <main className="p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl md:text-3xl font-bold text-white">Live Orders</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-colors">
          New Order
        </button>
      </div>

      <div className="panel-card bg-gray-800 border border-gray-700 rounded-lg p-4 shadow-lg overflow-x-auto">
        {orders.length > 0 ? (
          <table className="w-full text-left">
            <thead className="border-b border-gray-600">
              <tr>
                <th className="p-3">Order ID</th>
                <th className="p-3">Table</th>
                <th className="p-3">Total</th>
                <th className="p-3">Status</th>
                <th className="p-3">Time</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((order) => (
                <tr key={order.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                  <td className="p-3 font-mono text-indigo-400">#{order.id}</td>
                  <td className="p-3">{order.tableNumber}</td>
                  <td className="p-3">${order.total.toFixed(2)}</td>
                  <td className="p-3">
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColorMap[order.status]}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="p-3 text-gray-400">{new Date(order.timestamp).toLocaleTimeString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <p className="text-gray-400">No active orders.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Orders;