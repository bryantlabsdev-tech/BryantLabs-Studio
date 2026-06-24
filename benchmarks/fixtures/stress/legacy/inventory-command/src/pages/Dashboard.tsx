import { useState } from "react";

interface KpiData {
  title: string;
  value: string;
  change?: string;
  changeType?: 'positive' | 'negative';
}

const mockKpiData: KpiData[] = [
  { title: "Total Inventory Value", value: "$1,234,567", change: "+2.5%", changeType: 'positive' },
  { title: "Products Low on Stock", value: "42", change: "+5", changeType: 'negative' },
  { title: "Pending Purchase Orders", value: "18", change: "-2", changeType: 'positive' },
  { title: "Outbound Shipments Today", value: "112", change: "+12.1%", changeType: 'positive' },
];

const KpiCard = ({ title, value, change, changeType }: KpiData) => (
  <div className="panel-card">
    <h3 className="text-sm font-medium text-gray-400">{title}</h3>
    <div className="mt-2 flex items-baseline justify-between">
      <p className="text-2xl font-semibold text-white">{value}</p>
      {change && (
        <span
          className={`text-sm font-medium ${
            changeType === 'positive' ? 'text-green-400' : 'text-red-400'
          }`}
        >
          {change}
        </span>
      )}
    </div>
  </div>
);

const Dashboard = () => {
  const [kpis] = useState<KpiData[]>(mockKpiData);

  return (
    <main className="p-4 sm:p-6">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400">Welcome back, here's your inventory snapshot.</p>
      </header>
      
      {kpis.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {kpis.map((kpi) => (
            <KpiCard key={kpi.title} {...kpi} />
          ))}
        </div>
      ) : (
         <div className="panel-card text-center">
            <p className="text-gray-400">No KPI data available.</p>
         </div>
      )}

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="panel-card">
          <h2 className="text-lg font-semibold">Recent Stock Movements</h2>
          <p className="mt-2 text-gray-400">Activity graph coming soon...</p>
        </div>
        <div className="panel-card">
          <h2 className="text-lg font-semibold">Top Selling Products</h2>
          <p className="mt-2 text-gray-400">Product list coming soon...</p>
        </div>
      </div>
    </main>
  );
};

export default Dashboard;