import { useState } from "react";
// Note: ../types is incomplete, so we define RentPayment here.

export type PaymentStatus = 'paid' | 'late' | 'pending';

export type RentPayment = {
  id: string;
  tenantName: string;
  unitAddress: string;
  paymentDate: string;
  amount: number;
  status: PaymentStatus;
};

const mockPayments: RentPayment[] = [
  { id: 'p1', tenantName: 'Alice Johnson', unitAddress: '123 Maple St, #4B', paymentDate: '2024-07-01', amount: 2200, status: 'paid' },
  { id: 'p2', tenantName: 'Diana Prince', unitAddress: '101 Cherry Blvd, #C', paymentDate: '2024-07-05', amount: 1950, status: 'late' },
  { id: 'p3', tenantName: 'Frank Castle', unitAddress: '221B Baker St', paymentDate: '2024-07-01', amount: 3100, status: 'paid' },
  { id: 'p4', tenantName: 'Gwen Stacy', unitAddress: '1 Forest Hills Dr', paymentDate: '2024-07-01', amount: 2600, status: 'pending' },
];

const statusStyles: Record<PaymentStatus, string> = {
  paid: 'bg-green-600/30 text-green-300 border border-green-500/50',
  late: 'bg-red-600/30 text-red-300 border border-red-500/50',
  pending: 'bg-yellow-600/30 text-yellow-300 border border-yellow-500/50',
};

export default function RentPayments() {
  const [payments] = useState<RentPayment[]>(mockPayments);

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Rent Payments</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
          Record Payment
        </button>
      </div>

      <div className="panel-card bg-gray-800 border border-gray-700 rounded-lg shadow-md">
        {payments.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th scope="col" className="px-6 py-3">Tenant</th>
                  <th scope="col" className="px-6 py-3">Unit</th>
                  <th scope="col" className="px-6 py-3">Payment Date</th>
                  <th scope="col" className="px-6 py-3">Amount</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => (
                  <tr key={payment.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="px-6 py-4 font-medium text-white">{payment.tenantName}</td>
                    <td className="px-6 py-4">{payment.unitAddress}</td>
                    <td className="px-6 py-4">{payment.paymentDate}</td>
                    <td className="px-6 py-4">${payment.amount.toLocaleString()}</td>
                    <td className="px-6 py-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full capitalize ${statusStyles[payment.status]}`}>
                        {payment.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">
            <h3 className="text-lg font-semibold">No Payments Recorded</h3>
            <p className="mt-2">Start by recording a tenant's rent payment.</p>
          </div>
        )}
      </div>
    </main>
  );
}