import { BarChart3, Fuel, Wrench, UserCircle, MapPin } from "../components/IconStub";
import type { ComponentType } from "react";

interface ReportType {
  id: string;
  title: string;
  description: string;
  icon: ComponentType<{ className?: string }>;
}

const reportTypes: ReportType[] = [
  {
    id: "fuel-efficiency",
    title: "Fuel Efficiency",
    description: "Analyze fuel consumption and miles per gallon across the fleet.",
    icon: Fuel,
  },
  {
    id: "maintenance-history",
    title: "Maintenance History",
    description: "View upcoming, pending, and completed service for all vehicles.",
    icon: Wrench,
  },
  {
    id: "driver-performance",
    title: "Driver Performance",
    description: "Track driver behavior, including speed, braking, and idle time.",
    icon: UserCircle,
  },
  {
    id: "dispatch-summary",
    title: "Dispatch Summary",
    description: "Summary of all dispatch jobs, their statuses, and completion rates.",
    icon: MapPin,
  },
  {
    id: "asset-utilization",
    title: "Asset Utilization",
    description: "Report on vehicle usage, uptime, and operational hours.",
    icon: BarChart3,
  },
];

export default function Reports() {
  return (
    <main className="flex-1 p-6 overflow-y-auto">
      <div className="flex items-center mb-6">
        <h1 className="text-3xl font-bold text-white flex items-center">
          <BarChart3 className="w-8 h-8 mr-3" />
          Reports
        </h1>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {reportTypes.map((report) => (
          <div key={report.id} className="panel-card bg-gray-800 rounded-lg p-6 flex flex-col">
            <div className="flex items-center mb-4">
              <report.icon className="w-8 h-8 mr-4 text-blue-400" />
              <h2 className="text-xl font-bold text-white">{report.title}</h2>
            </div>
            <p className="text-gray-400 flex-grow mb-6">{report.description}</p>
            <button className="mt-auto w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
              Generate Report
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}