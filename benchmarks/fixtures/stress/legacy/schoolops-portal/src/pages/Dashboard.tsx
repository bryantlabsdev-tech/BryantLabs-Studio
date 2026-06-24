import { useState } from "react";

interface KpiData {
  title: string;
  value: string;
  change?: string;
  changeType?: "increase" | "decrease";
}

const KpiCard = ({ title, value, change, changeType }: KpiData) => {
  const changeColor =
    changeType === "increase"
      ? "text-green-400"
      : changeType === "decrease"
      ? "text-red-400"
      : "text-gray-400";

  return (
    <div className="panel-card">
      <h3 className="text-sm font-medium text-gray-400">{title}</h3>
      <div className="mt-2 flex items-baseline">
        <p className="text-2xl font-semibold text-gray-100">{value}</p>
        {change && (
          <p className={`ml-2 flex items-baseline text-sm font-semibold ${changeColor}`}>
            {change}
          </p>
        )}
      </div>
    </div>
  );
};

export default function Dashboard() {
  const [kpiData] = useState<KpiData[]>([
    {
      title: "Total Students",
      value: "1,284",
      change: "+2.5%",
      changeType: "increase",
    },
    {
      title: "Average Attendance",
      value: "94.6%",
      change: "-0.2%",
      changeType: "decrease",
    },
    {
      title: "Teachers on Duty",
      value: "78",
    },
    {
      title: "Behavior Incidents (Week)",
      value: "12",
      change: "+3",
      changeType: "increase",
    },
  ]);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <h1 className="text-2xl font-bold tracking-tight text-white mb-6">
        Dashboard
      </h1>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {kpiData.map((kpi) => (
          <KpiCard key={kpi.title} {...kpi} />
        ))}
      </div>

      {/* Placeholder for future charts and widgets */}
      <div className="mt-8">
        <div className="panel-card h-96">
          <h2 className="text-lg font-semibold">Yearly Enrollment Trends</h2>
          <div className="flex items-center justify-center h-full text-gray-500">
            Chart data would be displayed here.
          </div>
        </div>
      </div>
    </div>
  );
}