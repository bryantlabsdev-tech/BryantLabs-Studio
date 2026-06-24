import { useState } from "react";
import { EntityId, InvoiceStatus } from "../types";
import { PlusIcon } from "../components/IconStub";
// This type would typically be in `src/types.ts`
export interface Invoice {
  id: EntityId;
  customerName: string;
  status: InvoiceStatus;
  dueDate: string;
  amount: number;
}

const mockInvoices: Invoice[] = [
  { id: "INV-001", customerName: "John Doe", status: "Paid", dueDate: "2023-11-15", amount: 450.00 },
  { id: "INV-002", customerName: "Jane Smith", status: "Sent", dueDate: "2023-11-20", amount: 1200.50 },
  { id: "INV-003", customerName: "Bob Johnson", status: "Overdue", dueDate: "2023-10-15", amount: 85.00 },
  { id: "INV-004", customerName: "Alice Williams", status: "Draft", dueDate: "2023-11-25", amount: 620.75 },
  { id: "INV-005", customerName: "Mike Brown", status: "Void", dueDate: "2023-10-01", amount: 300.00 },
];

const getStatusBadgeClass = (status: InvoiceStatus): string => {
  const baseClass = "px-2 py-1 text-xs font-medium rounded-full";
  switch (status) {
    case 'Draft': return `${baseClass} bg-gray-500/20 text-gray-400`;
    case 'Sent': return `${baseClass} bg-blue-500/20 text-blue-400`;
    case 'Paid': return `${baseClass} bg-green-500/20 text-green-400`;
    case 'Overdue': return `${baseClass} bg-red-500/20 text-red-400`;
    case 'Void': return `${baseClass} bg-purple-500/20 text-purple-400`;
    default: return baseClass;
  }
};

export default function Invoices() {
  const [invoices] = useState<Invoice[]>(mockInvoices);

  return (
    <div className="p-6 space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-3xl font-bold text-white">Invoices</h1>
        <button className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold py-2 px-4 rounded-lg shadow-md transition-colors">
          <PlusIcon className="h-5 w-5" />
          New Invoice
        </button>
      </div>

      <div className="panel-card bg-gray-800/50 border border-gray-700 rounded-lg">
        <div className="p-4 border-b border-gray-700">
          <input
            type="text"
            placeholder="Search invoices..."
            className="w-full sm:w-1/3 bg-gray-900 border border-gray-700 rounded-md py-2 px-4 text-gray-200 focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
          />
        </div>
        {invoices.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-700 text-sm text-gray-400">
                <tr>
                  <th className="px-4 py-3 font-medium">Invoice ID</th>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Due Date</th>
                  <th className="px-4 py-3 font-medium">Amount</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-700">
                {invoices.map((inv) => (
                  <tr key={inv.id} className="hover:bg-gray-700/50">
                    <td className="px-4 py-3 font-mono text-sm text-indigo-400">{inv.id}</td>
                    <td className="px-4 py-3">{inv.customerName}</td>
                    <td className="px-4 py-3">{inv.dueDate}</td>
                    <td className="px-4 py-3 text-right">${inv.amount.toFixed(2)}</td>
                    <td className="px-4 py-3">
                      <span className={getStatusBadgeClass(inv.status)}>{inv.status}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-gray-300">No Invoices Found</h3>
            <p className="text-gray-500 mt-1">Get started by creating a new invoice.</p>
          </div>
        )}
      </div>
    </div>
  );
}