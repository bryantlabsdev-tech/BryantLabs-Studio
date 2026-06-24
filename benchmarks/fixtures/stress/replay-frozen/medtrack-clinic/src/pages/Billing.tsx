import { useState } from "react";
import { CreditCard, Plus, Search } from "../components/IconStub";
import type { BillingStatus } from "../types";

interface Invoice {
  id: string;
  patientName: string;
  invoiceDate: string;
  amount: number;
  status: BillingStatus;
}

const mockInvoices: Invoice[] = [
  { id: "inv001", patientName: "Eleanor Pena", invoiceDate: "2023-11-01", amount: 150.00, status: "Paid" },
  { id: "inv002", patientName: "Cody Fisher", invoiceDate: "2023-10-25", amount: 75.50, status: "Overdue" },
  { id: "inv003", patientName: "Arlene McCoy", invoiceDate: "2023-11-05", amount: 320.00, status: "Pending" },
  { id: "inv004", patientName: "Darlene Robertson", invoiceDate: "2023-09-15", amount: 200.00, status: "Sent to Collections" },
  { id: "inv005", patientName: "Ralph Edwards", invoiceDate: "2023-11-10", amount: 95.25, status: "Pending" },
];

const statusClasses: Record<BillingStatus, string> = {
  Paid: "bg-green-500/20 text-green-400",
  Pending: "bg-blue-500/20 text-blue-400",
  Overdue: "bg-yellow-500/20 text-yellow-400",
  "Sent to Collections": "bg-red-500/20 text-red-400",
};

const Billing = () => {
  const [invoices, _setInvoices] = useState<Invoice[]>(mockInvoices);

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount);
  };

  return (
    <main className="flex-1 p-6 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">Billing</h1>
        <button className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700">
          <Plus className="h-5 w-5" />
          <span>Create Invoice</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="panel-card bg-gray-800 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-400">Total Outstanding</h3>
          <p className="text-3xl font-semibold text-white mt-1">{formatCurrency(1500.75)}</p>
        </div>
        <div className="panel-card bg-gray-800 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-400">Overdue Invoices</h3>
          <p className="text-3xl font-semibold text-yellow-400 mt-1">4</p>
        </div>
        <div className="panel-card bg-gray-800 p-4 rounded-lg">
          <h3 className="text-sm font-medium text-gray-400">Revenue (This Month)</h3>
          <p className="text-3xl font-semibold text-green-400 mt-1">{formatCurrency(12540.21)}</p>
        </div>
      </div>

      <div className="panel-card bg-gray-800 p-6 rounded-lg">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-white">All Invoices</h2>
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-gray-400" />
            <input type="text" placeholder="Search by patient..." className="pl-10 pr-4 py-2 bg-gray-700 border border-gray-600 rounded-lg" />
          </div>
        </div>
        {invoices.length > 0 ? (
          <table className="w-full text-left">
            <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
              <tr>
                <th className="px-6 py-3">Invoice ID</th>
                <th className="px-6 py-3">Patient</th>
                <th className="px-6 py-3">Date</th>
                <th className="px-6 py-3">Amount</th>
                <th className="px-6 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((invoice) => (
                <tr key={invoice.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                  <td className="px-6 py-4 font-mono text-sm">{invoice.id}</td>
                  <td className="px-6 py-4 font-medium text-white">{invoice.patientName}</td>
                  <td className="px-6 py-4">{invoice.invoiceDate}</td>
                  <td className="px-6 py-4">{formatCurrency(invoice.amount)}</td>
                  <td className="px-6 py-4">
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusClasses[invoice.status]}`}>
                      {invoice.status}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <CreditCard className="mx-auto h-12 w-12 text-gray-500" />
            <h3 className="mt-2 text-lg font-medium text-white">No invoices found</h3>
            <p className="mt-1 text-sm text-gray-400">Create the first invoice to get started.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Billing;