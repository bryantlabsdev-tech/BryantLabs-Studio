import { FC } from "react";

const kpiData = [
  { title: "Upcoming Events", value: "3", description: "In the next 30 days" },
  { title: "Total Budget", value: "$125,500", description: "Across all events" },
  { title: "Open Tasks", value: "18", description: "Awaiting completion" },
  { title: "Vendors Confirmed", value: "12", description: "For upcoming events" },
];

const KpiCard: FC<{ title: string; value: string; description: string }> = ({
  title,
  value,
  description,
}) => (
  <div className="panel-card">
    <h3 className="text-sm font-medium text-gray-400">{title}</h3>
    <p className="mt-1 text-3xl font-semibold tracking-tight text-white">
      {value}
    </p>
    <p className="mt-1 text-sm text-gray-500">{description}</p>
  </div>
);

const Dashboard = () => {
  return (
    <main className="p-6 sm:p-8">
      <h1 className="text-2xl font-bold text-white mb-6">Dashboard</h1>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpiData.map((kpi) => (
          <KpiCard
            key={kpi.title}
            title={kpi.title}
            value={kpi.value}
            description={kpi.description}
          />
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="panel-card">
          <h2 className="text-xl font-semibold mb-4">
            Upcoming Event Milestones
          </h2>
          <p className="text-gray-400">
            A timeline of key dates and tasks will be shown here.
          </p>
        </div>
        <div className="panel-card">
          <h2 className="text-xl font-semibold mb-4">Budget Overview</h2>
          <p className="text-gray-400">
            A chart summarizing budget allocation and spending will be shown here.
          </p>
        </div>
      </div>
    </main>
  );
};

export default Dashboard;