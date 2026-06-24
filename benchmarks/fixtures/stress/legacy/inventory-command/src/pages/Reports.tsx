import { useState } from "react";

interface ReportDefinition {
  id: string;
  title: string;
  description: string;
}

const mockReports: ReportDefinition[] = [
  {
    id: "inventory-turnover",
    title: "Inventory Turnover Ratio",
    description: "Measures how many times inventory is sold or used over a period.",
  },
  {
    id: "stock-valuation",
    title: "Stock Valuation Report",
    description: "Calculates the total value of current inventory based on cost.",
  },
  {
    id: "supplier-performance",
    title: "Supplier Performance Review",
    description: "Analyzes supplier lead times, on-time delivery rates, and quality.",
  },
  {
    id: "low-stock",
    title: "Low Stock Summary",
    description: "Lists all products that are at or below their reorder point.",
  },
  {
    id: "aging-inventory",
    title: "Aging Inventory Report",
    description: "Identifies slow-moving or obsolete stock in the warehouse.",
  },
  {
    id: "sales-velocity",
    title: "Sales Velocity Report",
    description: "Tracks the rate at which products are selling.",
  },
];

const Reports = () => {
  const [reports] = useState<ReportDefinition[]>(mockReports);

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold text-gray-100">Reports</h2>
      </div>

      {reports.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {reports.map((report) => (
            <div
              key={report.id}
              className="panel-card bg-gray-800 p-5 rounded-lg shadow flex flex-col justify-between"
            >
              <div>
                <h3 className="text-lg font-semibold text-white">
                  {report.title}
                </h3>
                <p className="text-sm text-gray-400 mt-2">
                  {report.description}
                </p>
              </div>
              <button className="mt-4 text-left w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded transition-colors duration-200">
                Generate Report
              </button>
            </div>
          ))}
        </div>
      ) : (
        <div className="panel-card bg-gray-800 p-8 rounded-lg shadow text-center">
          <h3 className="text-lg font-semibold text-white">
            No Reports Available
          </h3>
          <p className="text-gray-400 mt-2">
            There are no report definitions configured in the system.
          </p>
        </div>
      )}
    </div>
  );
};

export default Reports;