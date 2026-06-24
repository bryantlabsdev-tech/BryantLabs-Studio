import { useState } from "react";
import { FiBriefcase, FiUser, FiAlertTriangle } from "../components/IconStub";
type KpiData = {
  title: string;
  value: string;
  icon: React.ElementType;
  color: string;
};

const mockKpiData: KpiData[] = [
  {
    title: "Active Cases",
    value: "42",
    icon: FiBriefcase,
    color: "text-blue-400",
  },
  {
    title: "Upcoming Deadlines",
    value: "8",
    icon: FiAlertTriangle,
    color: "text-yellow-400",
  },
  {
    title: "New Clients This Month",
    value: "12",
    icon: FiUser,
    color: "text-green-400",
  },
];

const KpiCard = ({ title, value, icon: Icon, color }: KpiData) => (
  <div className="panel-card">
    <div className="flex items-center">
      <div className={`mr-4 rounded-full bg-gray-700 p-3 ${color}`}>
        <Icon className="h-6 w-6" />
      </div>
      <div>
        <p className="text-sm font-medium text-gray-400">{title}</p>
        <p className="text-2xl font-bold">{value}</p>
      </div>
    </div>
  </div>
);

const Dashboard = () => {
  const [kpiData] = useState<KpiData[]>(mockKpiData);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="mb-6 text-3xl font-bold tracking-tight">Dashboard</h1>

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {kpiData.map((kpi) => (
          <KpiCard
            key={kpi.title}
            title={kpi.title}
            value={kpi.value}
            icon={kpi.icon}
            color={kpi.color}
          />
        ))}
      </div>

      <div className="panel-card mt-8">
        <h2 className="text-xl font-semibold">Recent Activity</h2>
        <p className="mt-2 text-gray-400">
          This section will show a timeline of recent events across all cases.
          (Component to be implemented in a future batch).
        </p>
      </div>
    </div>
  );
};

export default Dashboard;