import { useState } from "react";
import { FiPlus, FiCalendar } from "../components/IconStub";
import type { Hearing } from "../types";

const mockHearings: Hearing[] = [
  {
    id: "hr-001",
    caseName: "Smith v. Johnson",
    caseNumber: "CV-2023-101",
    date: "2024-08-15",
    time: "10:00 AM",
    location: "Courthouse A, Room 301",
    type: "Motion Hearing",
    status: "Scheduled",
  },
  {
    id: "hr-002",
    caseName: "State v. Doe",
    caseNumber: "CR-2023-202",
    date: "2024-07-22",
    time: "02:30 PM",
    location: "Federal Courthouse, Courtroom 5B",
    type: "Pre-trial Conference",
    status: "Scheduled",
  },
  {
    id: "hr-003",
    caseName: "MegaCorp v. Innovate LLC",
    caseNumber: "CIV-2022-890",
    date: "2024-06-10",
    time: "09:00 AM",
    location: "Courthouse B, Room 102",
    type: "Trial Day 1",
    status: "Completed",
  },
  {
    id: "hr-004",
    caseName: "Smith v. Johnson",
    caseNumber: "CV-2023-101",
    date: "2024-05-20",
    time: "11:00 AM",
    location: "Courthouse A, Room 301",
    type: "Discovery Hearing",
    status: "Postponed",
  },
];

const getStatusBadgeClass = (status: Hearing['status']) => {
  switch (status) {
    case "Scheduled": return "bg-blue-500/20 text-blue-300";
    case "Completed": return "bg-green-500/20 text-green-300";
    case "Postponed": return "bg-yellow-500/20 text-yellow-300";
    case "Cancelled": return "bg-red-500/20 text-red-300";
    default: return "bg-gray-500/20 text-gray-300";
  }
};

const Hearings = () => {
  const [hearings] = useState<Hearing[]>(mockHearings);

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-white">Hearings</h1>
        <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-white bg-indigo-600 rounded-md shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-900 focus:ring-indigo-500">
          <FiPlus />
          Schedule Hearing
        </button>
      </div>

      <div className="panel-card">
        {hearings.length === 0 ? (
          <div className="py-20 text-center">
            <FiCalendar className="mx-auto text-5xl text-gray-500" />
            <h3 className="mt-2 text-lg font-medium text-white">No hearings scheduled</h3>
            <p className="mt-1 text-sm text-gray-400">Get started by scheduling a new hearing.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-700">
              <thead className="bg-gray-800">
                <tr>
                  <th scope="col" className="py-3.5 pl-4 pr-3 text-left text-sm font-semibold text-gray-300 sm:pl-6">Case</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-300">Date & Time</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-300">Location</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-300">Type</th>
                  <th scope="col" className="px-3 py-3.5 text-left text-sm font-semibold text-gray-300">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-800 bg-gray-900">
                {hearings.map((hearing) => (
                  <tr key={hearing.id}>
                    <td className="py-4 pl-4 pr-3 text-sm font-medium text-white sm:pl-6">{hearing.caseName} <span className="block text-gray-400">{hearing.caseName}</span></td>
                    <td className="px-3 py-4 text-sm text-gray-300">{hearing.date} at {hearing.time}</td>
                    <td className="px-3 py-4 text-sm text-gray-300">{hearing.location}</td>
                    <td className="px-3 py-4 text-sm text-gray-300">{hearing.type}</td>
                    <td className="px-3 py-4 text-sm">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${getStatusBadgeClass(hearing.status)}`}>
                        {hearing.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default Hearings;