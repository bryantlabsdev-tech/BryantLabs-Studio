import { Truck, UserCircle, Wrench } from "../components/IconStub";

export default function Dashboard() {
  const kpis = [
    {
      title: "Total Vehicles",
      value: "124",
      icon: Truck,
      color: "text-blue-400",
    },
    {
      title: "Active Drivers",
      value: "88",
      icon: UserCircle,
      color: "text-green-400",
    },
    {
      title: "Vehicles in Shop",
      value: "7",
      icon: Wrench,
      color: "text-yellow-400",
    },
  ];

  return (
    <main className="p-6">
      <h1 className="text-3xl font-bold mb-6">Dashboard</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {kpis.map((kpi) => (
          <div key={kpi.title} className="panel-card">
            <div className="flex items-center">
              <div className={`p-3 rounded-lg mr-4 bg-gray-700 ${kpi.color}`}>
                <kpi.icon size={24} />
              </div>
              <div>
                <p className="text-sm text-gray-400">{kpi.title}</p>
                <p className="text-3xl font-bold">{kpi.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="panel-card">
          <h2 className="text-lg font-semibold mb-4">Fleet Status Overview</h2>
          <p className="text-gray-400">Chart component will be rendered here.</p>
        </div>
        <div className="panel-card">
          <h2 className="text-lg font-semibold mb-4">Recent Maintenance Alerts</h2>
          <p className="text-gray-400">List of recent alerts will be rendered here.</p>
        </div>
      </div>
    </main>
  );
}