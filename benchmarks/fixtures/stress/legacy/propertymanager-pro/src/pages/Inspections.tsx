import { useState } from "react";
import { InspectionStatus } from "../types";
import type { Inspection } from "../types";

const mockInspections: Array<Record<string, unknown>> = [
  { id: 'insp1', unitAddress: '123 Maple St, #4B', inspectionDate: '2024-08-15', type: 'routine', status: 'scheduled', inspector: 'John Doe',
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
  unitId: ""},
  { id: 'insp2', unitAddress: '456 Oak Ave, #12', inspectionDate: '2024-07-31', type: 'move-out', status: 'completed', inspector: 'Jane Smith',
  createdAt: new Date().toISOString().slice(0, 10),
  updatedAt: new Date().toISOString().slice(0, 10),
  unitId: ""},
  { id: 'insp3', unitAddress: '789 Pine Ln, #1A', inspectionDate: '2024-07-20', type: 'routine', status: 'completed', inspector: 'John Doe' },
  { id: 'insp4', unitAddress: '101 Elm Ct, #2C', inspectionDate: '2024-06-10', type: 'move-in', status: 'canceled', inspector: 'Jane Smith' },
];

const getStatusBadgeClasses = (status: InspectionStatus) => {
  switch (status) {
    case 'scheduled':
      return 'bg-blue-500/20 text-blue-300';
    case 'completed':
      return 'bg-green-500/20 text-green-300';
    case 'canceled':
      return 'bg-red-500/20 text-red-300';
    default:
      return 'bg-gray-500/20 text-gray-300';
  }
};

const Inspections = () => {
  const [inspections] = useState(mockInspections as unknown as Inspection[]);

  return (
    <main className="p-4 sm:p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Inspections</h1>
        <button className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500">
          Schedule Inspection
        </button>
      </div>

      <div className="panel-card overflow-x-auto">
        {inspections.length > 0 ? (
          <table className="min-w-full divide-y divide-gray-700">
            <thead className="bg-gray-800">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Unit</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Date</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Type</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Inspector</th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                <th scope="col" className="relative px-6 py-3"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="bg-gray-800/50 divide-y divide-gray-700">
              {inspections.map((inspection) => (
                <tr key={inspection.id}>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-white">{inspection.unitAddress}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{new Date(inspection.inspectionDate).toLocaleDateString()}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300 capitalize">{inspection.type}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{inspection.inspector}</td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm">
                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${getStatusBadgeClasses(inspection.status)}`}>
                      {inspection.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <a href="#" className="text-indigo-400 hover:text-indigo-300">View</a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-white">No Inspections Found</h3>
            <p className="mt-1 text-sm text-gray-400">Get started by scheduling a new inspection.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Inspections;