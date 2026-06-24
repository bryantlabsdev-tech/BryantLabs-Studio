import { useState } from "react";
import { BarChart3, Package, Truck, Bell } from "../components/IconStub";

const kpiData = [
  {
    title: "Total Products",
    value: "1,250",
    icon: Package,
    change: "+15%",
    changeType: "increase",
  },
  {
    title: "Total Suppliers",
    value: "82",
    icon: Truck,
    change: "+5",
    changeType: "increase",
  },
  {
    title: "Low Stock Alerts",
    value: "18",
    icon: Bell,
    change: "-3",
    changeType: "decrease",
  },
  {
    title: "Monthly Sales Volume",
    value: "45,890 units",
    icon: BarChart3,
    change: "+8.2%",
    changeType: "increase",
  },
];

const Dashboard = () => {
  // In a real app, this data would be fetched from an API
  const [kpis] = useState(kpiData);

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi) => (
          <div key={kpi.title} className="panel-card flex flex-col justify-between">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium text-gray-400">{kpi.title}</h3>
              <kpi.icon className="h-6 w-6 text-gray-500" />
            </div>
            <div>
              <p className="text-3xl font-bold">{kpi.value}</p>
              <p className={`text-sm ${kpi.changeType === 'increase' ? 'text-green-400' : 'text-red-400'}`}>
                {kpi.change} vs last month
              </p>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8">
        <div className="panel-card min-h-[300px]">
          <h2 className="text-xl font-semibold mb-4">Recent Activity</h2>
          <p className="text-gray-400">Activity feed will be displayed here.</p>
          {/* In a real app, a list or table of recent activities would be rendered here */}
        </div>
      </div>
    </div>
  );
};

export default Dashboard;