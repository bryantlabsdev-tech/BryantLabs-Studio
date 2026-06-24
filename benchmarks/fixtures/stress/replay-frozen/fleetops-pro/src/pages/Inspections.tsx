import { useState } from "react";
import type { InspectionStatus } from "../types";
import { ClipboardList, PlusCircle } from "../components/IconStub";

interface Inspection {
  id: string;
  vehicleId: string;
  vehicleModel: string;
  inspectorName: string;
  inspectionDate: string;
  status: InspectionStatus;
}

const mockInspections: Inspection[] = [
  {
    id: "I001",
    vehicleId: "V003",
    vehicleModel: "Volvo VNL 760",
    inspectorName: "Jane Smith",
    inspectionDate: "2023-10-25",
    status: "Passed",
  },
  {
    id: "I002",
    vehicleId: "V001",
    vehicleModel: "Ford Transit",
    inspectorName: "System",
    inspectionDate: "2023-10-24",
    status: "Failed",
  },
  {
    id: "I003",
    vehicleId: "V005",
    vehicleModel: "Kenworth T680",
    inspectorName: "Mike Johnson",
    inspectionDate: "2023-10-22",
    status: "Passed",
  },
  {
    id: "I004",
    vehicleId: "V007",
    vehicleModel: "Ford F-150",
    inspectorName: "Jane Smith",
    inspectionDate: "2023-10-21",
    status: "Pending",
  },
];

const statusColors: Record<string, string> = {
  Passed: "bg-green-500/20 text-green-400",
  Failed: "bg-red-500/20 text-red-400",
  Pending: "bg-yellow-500/20 text-yellow-400",
};

export default function Inspections() {
  const [inspections] = useState<Inspection[]>(mockInspections);

  return (
    <main className="flex-1 p-6 overflow-y-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-3xl font-bold text-white flex items-center">
          <ClipboardList className="w-8 h-8 mr-3" />
          Inspections
        </h1>
        <button className="flex items-center bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">
          <PlusCircle className="w-5 h-5 mr-2" />
          New Inspection
        </button>
      </div>

      <div className="panel-card bg-gray-800 rounded-lg p-0 overflow-hidden">
        {inspections.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-gray-700/50">
                <tr>
                  <th className="p-4 font-semibold">Vehicle</th>
                  <th className="p-4 font-semibold">Inspector</th>
                  <th className="p-4 font-semibold">Date</th>
                  <th className="p-4 font-semibold">Status</th>
                  <th className="p-4 font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((inspection) => (
                  <tr key={inspection.id} className="border-t border-gray-700 hover:bg-gray-700/50">
                    <td className="p-4">
                      <div>{inspection.vehicleModel}</div>
                      <div className="text-xs text-gray-400">{inspection.vehicleId}</div>
                    </td>
                    <td className="p-4">{inspection.inspectorName}</td>
                    <td className="p-4">{inspection.inspectionDate}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${statusColors[inspection.status]}`}>
                        {inspection.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <button className="text-blue-400 hover:text-blue-300">View Details</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <ClipboardList className="w-12 h-12 mx-auto text-gray-500" />
            <h3 className="mt-2 text-lg font-semibold text-gray-300">No inspections found</h3>
            <p className="mt-1 text-sm text-gray-500">Get started by creating a new inspection.</p>
          </div>
        )}
      </div>
    </main>
  );
}