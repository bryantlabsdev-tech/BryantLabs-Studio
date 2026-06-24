import { useState } from "react";
import type { Unit, UnitStatus } from "../types";

const mockUnits: Unit[] = [
  { id: 'u1', address: '123 Maple St', unitNumber: '4B', bedrooms: 2, bathrooms: 1, rentAmount: 2200, status: 'occupied', createdAt: '2023-01-10T10:00:00Z', updatedAt: '2023-05-15T14:30:00Z' },
  { id: 'u2', address: '123 Maple St', unitNumber: '5A', bedrooms: 3, bathrooms: 2, rentAmount: 2900, status: 'vacant', createdAt: '2023-01-10T10:00:00Z', updatedAt: '2023-06-20T11:00:00Z' },
  { id: 'u3', address: '789 Oak Ave', unitNumber: '12', bedrooms: 1, bathrooms: 1, rentAmount: 1500, status: 'under_maintenance', createdAt: '2023-02-15T12:00:00Z', updatedAt: '2023-07-01T09:45:00Z' },
  { id: 'u4', address: '456 Pine Ln', unitNumber: 'A', bedrooms: 2, bathrooms: 2, rentAmount: 2450, status: 'occupied', createdAt: '2023-03-20T16:00:00Z', updatedAt: '2023-06-01T18:20:00Z' },
];

const UnitStatusBadge = ({ status }: { status: UnitStatus }) => {
  const baseClasses = "px-2.5 py-0.5 text-xs font-medium rounded-full";
  const statusClasses = {
    occupied: "bg-green-500/20 text-green-400",
    vacant: "bg-gray-500/20 text-gray-300",
    under_maintenance: "bg-yellow-500/20 text-yellow-400",
  };
  return <span className={`${baseClasses} ${statusClasses[status]}`}>{status.replace('_', ' ')}</span>;
};


const Units = () => {
  const [units] = useState<Unit[]>(mockUnits);

  return (
    <main className="p-4 sm:p-6 lg:p-8">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold text-white">Units</h1>
        <button className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 px-4 rounded-md shadow-sm">
          Add Unit
        </button>
      </div>

      <div className="panel-card overflow-hidden">
        {units.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-800">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Address</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Beds/Baths</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Rent</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-300 uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody className="bg-gray-800 divide-y divide-gray-700">
                {units.map((unit) => (
                  <tr key={unit.id} className="hover:bg-gray-700/50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-white">{unit.address}, Unit {unit.unitNumber}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">{unit.bedrooms}bd / {unit.bathrooms}ba</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-300">${unit.rentAmount.toLocaleString()}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm"><UnitStatusBadge status={unit.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-12">
            <h3 className="text-lg font-medium text-white">No units found</h3>
            <p className="mt-1 text-sm text-gray-400">Add your first unit to get started.</p>
          </div>
        )}
      </div>
    </main>
  );
};

export default Units;