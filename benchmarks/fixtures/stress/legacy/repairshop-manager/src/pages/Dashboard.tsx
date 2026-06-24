import { useState } from "react";
import { WorkOrderStatus } from '../types';

interface KpiData {
  title: string;
  value: string;
  change?: string;
  changeType?: 'increase' | 'decrease';
}

const mockKpiData: KpiData[] = [
  { title: "Open Work Orders", value: "12" },
  { title: "Vehicles in Shop", value: "8" },
  { title: "Pending Estimates", value: "5" },
  { title: "Revenue (This Month)", value: "$12,450" },
];

const mockRecentActivity = [
    { id: 'WO-1024', status: 'In Progress' as WorkOrderStatus, description: 'Oil change on Toyota Camry' },
    { id: 'WO-1023', status: 'Completed' as WorkOrderStatus, description: 'Brake replacement on Honda Civic' },
    { id: 'EST-205', status: 'Approved', description: 'Engine diagnostic for Ford F-150' },
];


export default function Dashboard() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [kpis, _setKpis] = useState<KpiData[]>(mockKpiData);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [activity, _setActivity] = useState(mockRecentActivity);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-3xl font-bold text-white">Dashboard</h1>

      {/* KPI Tiles */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi) => (
          <div key={kpi.title} className="panel-card flex flex-col justify-between">
            <h3 className="text-sm font-medium text-gray-400">{kpi.title}</h3>
            <p className="text-3xl font-bold text-white">{kpi.value}</p>
          </div>
        ))}
      </div>

      {/* Recent Activity Section */}
      <div className="panel-card">
         <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
         <div className="space-y-3">
            {activity.map(item => (
                <div key={item.id} className="flex justify-between items-center p-2 rounded-md bg-gray-700/50">
                    <div>
                        <span className="font-bold">{item.id}</span>
                        <p className="text-sm text-gray-300">{item.description}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                        item.status === 'Completed' ? 'bg-green-500/20 text-green-300' :
                        item.status === 'In Progress' ? 'bg-blue-500/20 text-blue-300' :
                        'bg-yellow-500/20 text-yellow-300'
                    }`}>
                        {item.status}
                    </span>
                </div>
            ))}
         </div>
      </div>
    </div>
  );
}