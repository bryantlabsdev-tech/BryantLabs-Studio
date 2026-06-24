import { useState } from "react";
import { VehicleStatus, DriverStatus } from "../types";

// Mock data for KPIs - in a real app, this would come from an API
const mockDashboardData = {
  totalVehicles: 25,
  activeDrivers: 18,
  vehiclesInShop: 3,
  overdueInspections: 2,
};

// A simple KPI card component
const KpiCard = ({ title, value, unit }: { title: string; value: number; unit?: string }) => (
  <div className="panel-card flex flex-col justify-between">
    <h3 className="text-sm font-medium text-gray-400">{title}</h3>
    <p className="text-3xl font-bold text-white">
      {value}
      {unit && <span className="text-lg font-normal text-gray-300 ml-1">{unit}</span>}
    </p>
  </div>
);

const Dashboard = () => {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [dashboardData, _setDashboardData] = useState(mockDashboardData);

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        <KpiCard title="Total Vehicles" value={dashboardData.totalVehicles} />
        <KpiCard title="Active Drivers" value={dashboardData.activeDrivers} />
        <KpiCard title="Vehicles In Shop" value={dashboardData.vehiclesInShop} />
        <KpiCard title="Overdue Inspections" value={dashboardData.overdueInspections} />
      </div>

      <div className="mt-8">
        <div className="panel-card">
          <h2 className="text-lg font-semibold mb-4">Recent Alerts</h2>
          {/* In a real app, this list would be dynamic */}
          <ul className="space-y-2">
            <li className="text-yellow-400">Truck #102: Engine oil pressure low</li>
            <li className="text-red-500">Van #04: Inspection overdue by 5 days</li>
            <li className="text-yellow-400">Driver John Doe: License expiring soon</li>
          </ul>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;