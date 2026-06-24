import { useState } from "react";

const Dashboard = () => {
  // Mock data for KPIs, in a real app this would come from an API
  const [kpiData] = useState({
    totalUnits: 120,
    occupiedUnits: 110,
    openMaintenance: 5,
  });

  const occupancyRate =
    kpiData.totalUnits > 0
      ? ((kpiData.occupiedUnits / kpiData.totalUnits) * 100).toFixed(1)
      : "0.0";

  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <p className="text-gray-400">
          Welcome back, here's an overview of your properties.
        </p>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        <div className="panel-card">
          <h2 className="text-sm font-medium text-gray-400">Total Units</h2>
          <p className="mt-1 text-3xl font-semibold text-white">
            {kpiData.totalUnits}
          </p>
        </div>
        <div className="panel-card">
          <h2 className="text-sm font-medium text-gray-400">
            Occupancy Rate
          </h2>
          <p className="mt-1 text-3xl font-semibold text-white">
            {occupancyRate}%
          </p>
        </div>
        <div className="panel-card">
          <h2 className="text-sm font-medium text-gray-400">
            Open Maintenance Requests
          </h2>
          <p className="mt-1 text-3xl font-semibold text-white">
            {kpiData.openMaintenance}
          </p>
        </div>
      </div>

      {/* Placeholder for future charts or lists */}
      <div className="mt-8">
        <div className="panel-card">
          <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
          <p className="mt-2 text-gray-400">Activity feed will be shown here.</p>
        </div>
      </div>
    </main>
  );
};

export default Dashboard;