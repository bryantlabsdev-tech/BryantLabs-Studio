import { useState } from "react";
import type { PayrollRun, PayrollRunStatus } from '../types';

const mockPayrollRuns: PayrollRun[] = [
  {
    id: 'pr-1',
    payPeriodStart: '2023-11-01',
    payPeriodEnd: '2023-11-15',
    payDate: '2023-11-20',
    totalGrossPay: 125400.50,
    status: 'Processed',
  amount: 0,
  createdAt: new Date().toISOString().slice(0, 10),
},
  {
    id: 'pr-2',
    payPeriodStart: '2023-10-16',
    payPeriodEnd: '2023-10-31',
    payDate: '2023-11-05',
    totalGrossPay: 124950.00,
    status: 'Processed',
  amount: 0,
  createdAt: new Date().toISOString().slice(0, 10),
},
  {
    id: 'pr-3',
    payPeriodStart: '2023-10-01',
    payPeriodEnd: '2023-10-15',
    payDate: '2023-10-20',
    totalGrossPay: 123800.75,
    status: 'Processed',
  amount: 0,
  createdAt: new Date().toISOString().slice(0, 10),
},
  {
    id: 'pr-4',
    payPeriodStart: '2023-11-16',
    payPeriodEnd: '2023-11-30',
    payDate: '2023-12-05',
    totalGrossPay: 126100.00,
    status: 'Pending',
  amount: 0,
  createdAt: new Date().toISOString().slice(0, 10),
},
];

const getStatusBadge = (status: PayrollRunStatus) => {
  const baseClasses = 'rounded-full px-2 py-1 text-xs font-semibold';
  switch (status) {
    case 'Processed':
      return <span className={`${baseClasses} bg-green-500/20 text-green-400`}>Processed</span>;
    case 'Pending':
      return <span className={`${baseClasses} bg-yellow-500/20 text-yellow-400`}>Pending</span>;
    case 'Failed':
      return <span className={`${baseClasses} bg-red-500/20 text-red-400`}>Failed</span>;
  }
};

export default function PayrollSummary() {
  const [payrollRuns] = useState<PayrollRun[]>(mockPayrollRuns);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-semibold text-white">Payroll History</h2>
        <button className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900">
          Run New Payroll
        </button>
      </div>

      <div className="panel-card bg-gray-800 p-4 rounded-lg">
        {payrollRuns.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th scope="col" className="px-6 py-3">Pay Period</th>
                  <th scope="col" className="px-6 py-3">Pay Date</th>
                  <th scope="col" className="px-6 py-3">Gross Pay</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {payrollRuns.map((run) => (
                  <tr key={run.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                    <td className="px-6 py-4">{run.payPeriodStart} - {run.payPeriodEnd}</td>
                    <td className="px-6 py-4">{run.payDate}</td>
                    <td className="px-6 py-4">${(run.totalGrossPay ?? 0).toLocaleString()}</td>
                    <td className="px-6 py-4">{getStatusBadge((run.status ?? "Processed") as PayrollRunStatus)}</td>
                    <td className="px-6 py-4 text-right">
                      <a href="#" className="font-medium text-indigo-500 hover:underline">View Details</a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-semibold text-gray-300">No Payroll History Found</h3>
            <p className="mt-1 text-sm text-gray-500">Run a new payroll to see its summary here.</p>
          </div>
        )}
      </div>
    </div>
  );
}