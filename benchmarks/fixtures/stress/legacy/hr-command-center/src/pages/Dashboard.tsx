import { useState } from "react";

interface KpiData {
  title: string;
  value: string;
  change?: string;
  changeType?: 'increase' | 'decrease';
}

const mockKpiData: KpiData[] = [
  {
    title: 'Total Employees',
    value: '214',
    change: '+5 this month',
    changeType: 'increase',
  },
  {
    title: 'Pending Time Off',
    value: '12 requests',
    change: '-2 from yesterday',
    changeType: 'decrease',
  },
  {
    title: 'New Hires',
    value: '8',
    change: 'Onboarding in progress',
  },
  {
    title: 'Open Positions',
    value: '5',
    change: '3 Engineering, 2 Sales',
  }
];

export default function Dashboard() {
  const [kpis] = useState<KpiData[]>(mockKpiData);

  return (
    <main className="flex-1 overflow-y-auto p-6">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-white">Dashboard</h1>
        <p className="text-gray-400">Welcome back, here's a summary of your organization.</p>
      </div>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {kpis.map((kpi) => (
          <div key={kpi.title} className="panel-card flex flex-col justify-between">
            <div>
              <p className="text-sm font-medium text-gray-400">{kpi.title}</p>
              <p className="text-3xl font-bold text-white">{kpi.value}</p>
            </div>
            {kpi.change && (
              <p className={`text-xs ${
                kpi.changeType === 'increase' ? 'text-green-400' : 
                kpi.changeType === 'decrease' ? 'text-red-400' : 'text-gray-400'
              }`}>
                {kpi.change}
              </p>
            )}
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
         <div className="panel-card">
           <h2 className="text-lg font-semibold mb-4">Upcoming Reviews</h2>
           <p className="text-gray-400">Performance review chart will be here.</p>
         </div>
         <div className="panel-card">
           <h2 className="text-lg font-semibold mb-4">Department Headcount</h2>
           <p className="text-gray-400">Department distribution chart will be here.</p>
         </div>
      </div>
    </main>
  );
}