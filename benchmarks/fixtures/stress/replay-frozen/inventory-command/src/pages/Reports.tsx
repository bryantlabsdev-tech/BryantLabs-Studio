import { useState } from "react";
import { BarChart3, Package, Truck, ArrowRightLeft, Download } from "../components/IconStub";

// NOTE: In a real app, this type might live in src/types.ts
interface ReportConfig {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const mockReports: ReportConfig[] = [
  {
    id: "report_inventory_valuation",
    title: "Inventory Valuation",
    description: "Summary of current stock levels and their total value based on cost price.",
    icon: Package,
  },
  {
    id: "report_stock_movement",
    title: "Stock Movement History",
    description: "Detailed log of all inbound, outbound, and adjustment transactions.",
    icon: ArrowRightLeft,
  },
  {
    id: "report_supplier_performance",
    title: "Supplier Performance",
    description: "Analyze delivery times, lead time, and order accuracy for each supplier.",
    icon: Truck,
  },
  {
    id: "report_low_stock",
    title: "Low Stock Summary",
    description: "Lists all products that are currently below their reorder level.",
    icon: BarChart3,
  },
];


export default function Reports() {
  const [reports] = useState<ReportConfig[]>(mockReports);

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold text-white">Reports</h1>
      </div>
      
      {reports.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
          {reports.map((report) => (
            <div key={report.id} className="panel-card flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-4 mb-3">
                  <div className="bg-gray-700 p-2 rounded-lg">
                    <report.icon className="h-6 w-6 text-blue-400" />
                  </div>
                  <h2 className="text-lg font-semibold text-white">{report.title}</h2>
                </div>
                <p className="text-gray-400 text-sm mb-4">
                  {report.description}
                </p>
              </div>
              <button className="w-full mt-auto bg-blue-600 text-white font-semibold py-2 px-4 rounded-lg hover:bg-blue-700 transition-colors flex items-center justify-center gap-2">
                <Download className="h-4 w-4" />
                <span>Generate Report</span>
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel-card text-center py-12">
          <BarChart3 className="h-12 w-12 mx-auto text-gray-500 mb-4" />
          <h3 className="text-xl font-semibold text-white">No Reports Available</h3>
          <p className="text-gray-400 mt-2">
            There are no report configurations available at this time.
          </p>
        </div>
      )}
    </div>
  );
}