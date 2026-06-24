import { useMemo, useState } from "react";
import { BillingStatus } from "../types";
import { DollarSign, PlusCircle, Filter } from "../components/IconStub";
interface BillingInvoice {
  id: string;
  patientName: string;
  date: string;
  amount: number;
  status: BillingStatus;
}

const mockInvoices: BillingInvoice[] = [
  { id: 'INV001', patientName: 'John Doe', date: '2023-11-01', amount: 150.00, status: 'Paid' },
  { id: 'INV002', patientName: 'Jane Smith', date: '2023-11-05', amount: 75.50, status: 'Pending' },
  { id: 'INV003', patientName: 'Jim Brown', date: '2023-09-15', amount: 200.00, status: 'Overdue' },
  { id: 'INV004', patientName: 'Emily White', date: '2023-10-28', amount: 310.25, status: 'Paid' },
  { id: 'INV005', patientName: 'Michael Green', date: '2023-11-10', amount: 95.00, status: 'Pending' },
];

const getStatusBadgeClass = (status: BillingStatus) => {
  switch (status) {
    case "Paid": return "bg-green-500/20 text-green-300";
    case "Pending": return "bg-yellow-500/20 text-yellow-300";
    case "Overdue": return "bg-red-500/20 text-red-300";
    default: return "bg-gray-500/20 text-gray-300";
  }
};

export default function Billing() {
  const [statusFilter, setStatusFilter] = useState<BillingStatus | 'All'>('All');

  const filteredInvoices = useMemo(() => {
    if (statusFilter === 'All') return mockInvoices;
    return mockInvoices.filter(invoice => invoice.status === statusFilter);
  }, [statusFilter]);

  const kpis = useMemo(() => {
    return {
      totalBilled: mockInvoices.reduce((acc, inv) => acc + inv.amount, 0),
      totalPaid: mockInvoices.filter(i => i.status === 'Paid').reduce((acc, inv) => acc + inv.amount, 0),
      totalOverdue: mockInvoices.filter(i => i.status === 'Overdue').reduce((acc, inv) => acc + inv.amount, 0),
    };
  }, []);

  return (
    <main className="flex-1 p-6 overflow-auto">
      <h1 className="text-3xl font-bold mb-6">Billing</h1>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
        <div className="panel-card">
          <h3 className="text-sm font-medium text-gray-400">Total Billed</h3>
          <p className="text-3xl font-bold text-white">${kpis.totalBilled.toFixed(2)}</p>
        </div>
        <div className="panel-card">
          <h3 className="text-sm font-medium text-gray-400">Total Paid</h3>
          <p className="text-3xl font-bold text-green-400">${kpis.totalPaid.toFixed(2)}</p>
        </div>
        <div className="panel-card">
          <h3 className="text-sm font-medium text-gray-400">Total Overdue</h3>
          <p className="text-3xl font-bold text-red-400">${kpis.totalOverdue.toFixed(2)}</p>
        </div>
      </div>

      <div className="panel-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-4">
            <h2 className="text-xl font-semibold">Invoices</h2>
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-gray-400" />
              <select
                className="bg-gray-700 border border-gray-600 rounded-md px-2 py-1 text-sm focus:outline-none"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as BillingStatus | 'All')}
              >
                <option value="All">All Statuses</option>
                <option value="Paid">Paid</option>
                <option value="Pending">Pending</option>
                <option value="Overdue">Overdue</option>
              </select>
            </div>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 rounded-lg text-white font-semibold">
            <PlusCircle size={18} />
            <span>New Invoice</span>
          </button>
        </div>
        {filteredInvoices.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-600">
                <tr>
                  <th className="p-3">Invoice ID</th>
                  <th className="p-3">Patient</th>
                  <th className="p-3">Date</th>
                  <th className="p-3 text-right">Amount</th>
                  <th className="p-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {filteredInvoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="p-3 font-mono text-sm">{inv.id}</td>
                    <td className="p-3 font-medium">{inv.patientName}</td>
                    <td className="p-3">{inv.date}</td>
                    <td className="p-3 text-right font-medium">${inv.amount.toFixed(2)}</td>
                    <td className="p-3">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${getStatusBadgeClass(inv.status)}`}>
                        {inv.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-16">
            <DollarSign size={48} className="mx-auto text-gray-500" />
            <h3 className="mt-4 text-xl font-semibold">No Invoices Found</h3>
            <p className="mt-2 text-gray-400">There are no invoices for the selected filter.</p>
          </div>
        )}
      </div>
    </main>
  );
}