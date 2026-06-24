import { useState } from "react";
import { BudgetStatus } from "../types";

type Budget = {
  id: string;
  eventName: string;
  totalBudget: number;
  amountSpent: number;
  status: BudgetStatus;
};

const mockBudgets: Budget[] = [
  { id: '1', eventName: 'Annual Tech Conference 2024', totalBudget: 50000, amountSpent: 35000, status: 'Approved' },
  { id: '2', eventName: 'Summer Music Festival', totalBudget: 120000, amountSpent: 125000, status: 'Exceeded' },
  { id: '3', eventName: 'Charity Gala 2024', totalBudget: 75000, amountSpent: 15000, status: 'Approved' },
  { id: '4', eventName: 'Corporate Retreat Q3', totalBudget: 25000, amountSpent: 0, status: 'Draft' },
];

const currencyFormatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
});

const getStatusBadgeClass = (status: BudgetStatus) => {
  switch (status) {
    case 'Approved': return 'bg-green-600/30 text-green-300';
    case 'Exceeded': return 'bg-red-600/30 text-red-300';
    case 'Draft': return 'bg-gray-600/30 text-gray-300';
    default: return 'bg-gray-600/30 text-gray-300';
  }
};

const Budgets = () => {
  const [budgets] = useState<Budget[]>(mockBudgets);

  return (
    <main className="flex-1 p-6">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white">Budgets</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md transition-colors">
          + Create Budget
        </button>
      </div>

      <div className="panel-card bg-gray-800 rounded-lg shadow-lg">
        {budgets.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left text-gray-300">
              <thead className="text-xs text-gray-400 uppercase bg-gray-700/50">
                <tr>
                  <th scope="col" className="px-6 py-3">Event Name</th>
                  <th scope="col" className="px-6 py-3 text-right">Total Budget</th>
                  <th scope="col" className="px-6 py-3 text-right">Spent</th>
                  <th scope="col" className="px-6 py-3 text-right">Remaining</th>
                  <th scope="col" className="px-6 py-3">Status</th>
                  <th scope="col" className="px-6 py-3"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {budgets.map((budget) => {
                  const remaining = budget.totalBudget - budget.amountSpent;
                  return (
                    <tr key={budget.id} className="border-b border-gray-700 hover:bg-gray-700/50">
                      <td className="px-6 py-4 font-medium text-white whitespace-nowrap">{budget.eventName}</td>
                      <td className="px-6 py-4 text-right">{currencyFormatter.format(budget.totalBudget)}</td>
                      <td className="px-6 py-4 text-right">{currencyFormatter.format(budget.amountSpent)}</td>
                      <td className={`px-6 py-4 text-right font-mono ${remaining < 0 ? 'text-red-400' : ''}`}>
                        {currencyFormatter.format(remaining)}
                      </td>
                      <td className="px-6 py-4">
                        <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(budget.status)}`}>
                          {budget.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-right">
                        <a href="#" className="font-medium text-indigo-400 hover:underline">View</a>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center p-12">
            <h2 className="text-xl font-semibold text-white">No Budgets Found</h2>
            <p className="text-gray-400 mt-2">Get started by creating a new budget for an event.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Budgets;