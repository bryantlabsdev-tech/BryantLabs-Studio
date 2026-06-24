import { useState } from "react";
import { PlusIcon } from "../components/IconStub";
import { Technician } from "../types";

const mockTechnicians: Technician[] = [
  { id: "T1", name: "Mike Miller", specialization: "Engine & Transmission", status: "Active" },
  { id: "T2", name: "Sarah Chen", specialization: "Brakes & Suspension", status: "Active" },
  { id: "T3", name: "Carlos Rodriguez", specialization: "Diagnostics & Electrical", status: "Active" },
  { id: "T4", name: "David Wilson", specialization: "General Maintenance", status: "Inactive" },
];

const statusColors: Record<string, string> = {
  Active: "bg-green-500/20 text-green-400",
  Inactive: "bg-gray-500/20 text-gray-400",
};

export default function Technicians() {
  const [technicians] = useState<Technician[]>(mockTechnicians);

  return (
    <main className="flex-1 p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Technicians</h1>
        <button className="flex items-center gap-2 px-4 py-2 text-white bg-indigo-600 rounded-lg shadow-md hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-900">
          <PlusIcon className="w-5 h-5" />
          <span>Add Technician</span>
        </button>
      </div>

      <div className="panel-card">
        {technicians.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="border-b border-gray-700">
                <tr>
                  <th className="p-4">Name</th>
                  <th className="p-4">Specialization</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Actions</th>
                </tr>
              </thead>
              <tbody>
                {technicians.map((tech) => (
                  <tr key={tech.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                    <td className="p-4 font-medium">{tech.name}</td>
                    <td className="p-4 text-gray-300">{tech.specialization}</td>
                    <td className="p-4">
                      <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusColors[tech.status ?? ""]}`}>
                        {tech.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <button className="text-indigo-400 hover:text-indigo-300">Edit</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-8 text-center text-gray-400">
            <h3 className="text-xl font-semibold">No Technicians Found</h3>
            <p className="mt-2 text-sm">Click "Add Technician" to get started.</p>
          </div>
        )}
      </div>
    </main>
  );
}